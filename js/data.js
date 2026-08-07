// data.js — ADAPTADOR DE DADOS (fonte única).
// -----------------------------------------------------------------------------
// HOJE: mock em localStorage (backend não está no ar).
// AMANHÃ: com o Supabase criado, reescrever SÓ os métodos deste arquivo usando
//         supabase-js. A API pública (async) e as tabelas já espelham o schema.sql,
//         então nenhum outro arquivo precisa mudar.
//
// Toda linha carrega `negocio` e cada tela consulta filtrada na sua própria empresa
// (regra de isolamento do PROMPT). Aqui os filtros são explícitos por `negocio`.
// -----------------------------------------------------------------------------

const NF2 = window.NF || (window.NF = {});

// Cliente Supabase único (compartilhado com auth.js → mesma sessão/JWT).
NF2.sb = NF2.sb || window.supabase.createClient(NF_CONFIG.SUPABASE_URL, NF_CONFIG.SUPABASE_ANON_KEY);

NF2.data = (() => {
  const T = t => 'nf_' + t;         // nome lógico -> tabela física (prefixo nf_)
  const sb = () => NF.sb;

  // ---- CRUD genérico (Supabase) ----
  async function list(tabela, filtro = {}) {
    let q = sb().from(T(tabela)).select('*');
    for (const [k, v] of Object.entries(filtro)) if (v !== undefined) q = q.eq(k, v);
    const { data, error } = await q;
    if (error) { console.error('[list]', tabela, error.message); return []; }
    return data || [];
  }
  async function insert(tabela, row) {
    const { data, error } = await sb().from(T(tabela)).insert(row).select().single();
    if (error) { console.error('[insert]', tabela, error.message); NF.ui.toast('Erro ao salvar', 'err'); return null; }
    return data;
  }
  async function update(tabela, id, patch) {
    if (!patch || Object.keys(patch).length === 0) {   // sem mudanças → só devolve a linha
      const { data } = await sb().from(T(tabela)).select('*').eq('id', id).maybeSingle();
      return data;
    }
    const { data, error } = await sb().from(T(tabela)).update(patch).eq('id', id).select().maybeSingle();
    if (error) { console.error('[update]', tabela, error.message); NF.ui.toast('Erro ao atualizar', 'err'); return null; }
    return data;
  }
  async function remove(tabela, id) {
    const { error } = await sb().from(T(tabela)).delete().eq('id', id);
    if (error) { console.error('[remove]', tabela, error.message); NF.ui.toast('Erro ao excluir', 'err'); }
  }

  // ---- Operações de negócio compostas ----------------------------------------

  // Normaliza os meios de pagamento: usa v.pagamentos (1 ou 2) ou cai no modo antigo.
  function meiosDe(v) {
    if (v.pagamentos && v.pagamentos.length) {
      return v.pagamentos.filter(p => p.forma_pagamento_id && (Number(p.valor) || 0) > 0)
        .map(p => ({ forma_pagamento_id: p.forma_pagamento_id, valor: Number(p.valor) || 0, num_parcelas: p.num_parcelas || 1 }));
    }
    return [{ forma_pagamento_id: v.forma_pagamento_id, valor: v.valor_bruto, num_parcelas: v.num_parcelas || 1 }];
  }

  // Gera as parcelas de UM meio de pagamento e as insere na carteira (recebendo se for o caso).
  async function gerarCarteira(vendaId, v, meio, formasAll, multi) {
    const forma = formasAll.find(f => f.id === meio.forma_pagamento_id) || {};
    const parcelas = NF.util.gerarParcelas(meio.valor, v.data_venda, meio.num_parcelas, forma, v.negocio);
    // situacao: 'recebido' recebe tudo; 'pendente' nada; 'auto'/vazio segue a forma (imediata cai na hora).
    const receberTudo = v.situacao === 'recebido' ? true : v.situacao === 'pendente' ? false : !!forma.recebimento_imediato;
    const desc = multi ? `${v.descricao || 'venda'} (${forma.nome || 'meio'})` : v.descricao;
    for (const p of parcelas) {
      const linha = await insert('carteira', {
        venda_id: vendaId, negocio: v.negocio, cliente: v.cliente, descricao: desc,
        valor_parcela_liquido: p.valor_parcela_liquido, valor_parcela_bruto: p.valor_parcela_bruto,
        parcela_num: p.parcela_num, total_parcelas: p.total_parcelas,
        data_prevista: p.data_prevista, status: p.status, data_recebido: null,
        vendedora_id: v.vendedora_id || null, lancamento_id: null,
      });
      if (receberTudo) await receberParcela(linha.id, v.data_venda);
    }
  }

  // Registra uma VENDA (1 ou 2 meios de pagamento) e gera as parcelas na CARTEIRA.
  async function registrarVenda(v) {
    const formasAll = await list('formas_pagamento');
    const meios = meiosDe(v);
    const valor_bruto = NF.util.round2(meios.reduce((s, m) => s + m.valor, 0));
    const prim = formasAll.find(f => f.id === meios[0].forma_pagamento_id) || {};
    const venda = await insert('vendas', {
      negocio: v.negocio, cliente: v.cliente, descricao: v.descricao,
      valor_bruto, data_venda: v.data_venda,
      forma_pagamento_id: meios[0].forma_pagamento_id, num_parcelas: meios[0].num_parcelas,
      taxa_pct_aplicada: NF.util.taxaEfetiva(prim, meios[0].num_parcelas, v.negocio), curso_id: v.curso_id || null,
      situacao: v.situacao || 'auto', pagamentos: meios, vendedora_id: v.vendedora_id || null,
    });
    for (const m of meios) await gerarCarteira(venda.id, v, m, formasAll, meios.length > 1);
    return venda;
  }

  // Edita uma venda e REFAZ a carteira dela (remove as parcelas antigas + lançamentos
  // ligados e recria com os novos valores). Mantém a consistência do que foi lançado.
  async function atualizarVenda(id, v) {
    const atual = (await list('vendas')).find(x => x.id === id);
    if (!atual) return null;
    // Remove carteira + lançamentos antigos desta venda.
    const antigas = await list('carteira', { venda_id: id });
    for (const c of antigas) {
      if (c.lancamento_id) await remove('lancamentos', c.lancamento_id);
      await remove('carteira', c.id);
    }
    const formasAll = await list('formas_pagamento');
    const meios = meiosDe(v);
    const valor_bruto = NF.util.round2(meios.reduce((s, m) => s + m.valor, 0));
    const prim = formasAll.find(f => f.id === meios[0].forma_pagamento_id) || {};
    const vv = { ...v, negocio: atual.negocio };   // gerarCarteira usa v.negocio
    await update('vendas', id, {
      cliente: v.cliente, descricao: v.descricao, valor_bruto, data_venda: v.data_venda,
      forma_pagamento_id: meios[0].forma_pagamento_id, num_parcelas: meios[0].num_parcelas,
      taxa_pct_aplicada: NF.util.taxaEfetiva(prim, meios[0].num_parcelas, atual.negocio), curso_id: v.curso_id || null,
      situacao: v.situacao || 'auto', pagamentos: meios, vendedora_id: v.vendedora_id || null,
    });
    for (const m of meios) await gerarCarteira(id, vv, m, formasAll, meios.length > 1);
    return update('vendas', id, {});
  }

  // Marca uma parcela como recebida -> lança receita (líquido) no caixa daquele dia.
  async function receberParcela(carteiraId, dataRecebido) {
    const par = (await list('carteira')).find(c => c.id === carteiraId);
    if (!par || par.status === 'recebido') return null;
    const lanc = await insert('lancamentos', {
      negocio: par.negocio, tipo: 'receita', descricao: `Recebimento: ${par.descricao || par.cliente || 'venda'} (${par.parcela_num}/${par.total_parcelas})`,
      categoria: 'Recebimento', valor: par.valor_parcela_liquido,
      data: dataRecebido || NF.util.hoje(), vendedora_id: par.vendedora_id || null,
    });
    return update('carteira', carteiraId, {
      status: 'recebido', data_recebido: dataRecebido || NF.util.hoje(), lancamento_id: lanc.id,
    });
  }

  // Desfaz o recebimento (volta pra previsto e remove o lançamento).
  async function estornarParcela(carteiraId) {
    const par = (await list('carteira')).find(c => c.id === carteiraId);
    if (!par || par.status !== 'recebido') return null;
    if (par.lancamento_id) await remove('lancamentos', par.lancamento_id);
    return update('carteira', carteiraId, { status: 'previsto', data_recebido: null, lancamento_id: null });
  }

  // Recebe um pagamento contra a DÍVIDA de um cliente/aluna (base de alunas).
  // Baixa as parcelas em aberto da mais antiga p/ a mais nova; se o valor não fechar
  // uma parcela, faz baixa PARCIAL (divide a parcela). Cada baixa cai no caixa.
  async function receberDaAluna(negocio, cliente, valor, dataRecebido, forma) {
    let restante = NF.util.round2(valor);
    const abertas = (await list('carteira', { negocio }))
      .filter(p => p.cliente === cliente && p.status !== 'recebido')
      .sort((a, b) => a.data_prevista.localeCompare(b.data_prevista));
    for (const p of abertas) {
      if (restante <= 0) break;
      if (restante >= p.valor_parcela_liquido) {
        restante = NF.util.round2(restante - p.valor_parcela_liquido);
        await receberParcela(p.id, dataRecebido);
      } else {
        // baixa parcial: cria uma parcela recebida com `restante` e reduz a original.
        const parcial = await insert('carteira', {
          venda_id: p.venda_id, negocio, cliente, descricao: (p.descricao || 'saldo') + ' (pagamento' + (forma ? ' ' + forma : '') + ')',
          valor_parcela_liquido: restante, valor_parcela_bruto: restante,
          parcela_num: p.parcela_num, total_parcelas: p.total_parcelas,
          data_prevista: dataRecebido, status: 'previsto', data_recebido: null,
          vendedora_id: p.vendedora_id || null, lancamento_id: null,
        });
        await receberParcela(parcial.id, dataRecebido);
        await update('carteira', p.id, {
          valor_parcela_liquido: NF.util.round2(p.valor_parcela_liquido - restante),
          valor_parcela_bruto: NF.util.round2(p.valor_parcela_bruto - restante),
        });
        restante = 0;
      }
    }
    return NF.util.round2(valor - restante); // quanto foi efetivamente aplicado
  }

  return {
    list, insert, update, remove,
    registrarVenda, atualizarVenda, receberParcela, estornarParcela, receberDaAluna,
  };
})();

// export.js — exportação para Excel (.xlsx) via SheetJS (CDN). Mantém o site estático.
// Exporta os dados financeiros da empresa em abas (Vendas, A Receber, Despesas + extras).
const NFx = window.NF || (window.NF = {});

NF.export = (() => {
  function add(wb, nome, linhas) {
    const ws = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ '(vazio)': '' }]);
    XLSX.utils.book_append_sheet(wb, ws, nome.slice(0, 31)); // limite de nome de aba do Excel
  }

  // aba: aba aberta no financeiro — em 'despesas', exporta SÓ as despesas.
  async function negocio(neg, aba) {
    if (typeof XLSX === 'undefined') { NF.ui.toast('Biblioteca de Excel não carregou', 'err'); return; }
    const soDespesas = aba === 'despesas';
    const [vendas, carteira, lanc, formas, vendedoras] = await Promise.all([
      NF.data.list('vendas', { negocio: neg }),
      NF.data.list('carteira', { negocio: neg }),
      NF.data.list('lancamentos', { negocio: neg }),
      NF.data.list('formas_pagamento'),
      NF.data.list('vendedoras'),
    ]);
    const fMap = Object.fromEntries(formas.map(f => [f.id, f.nome]));
    const vMap = Object.fromEntries(vendedoras.map(v => [v.id, v.nome]));
    const cursos = neg === 'academy' ? await NF.data.list('cursos', { negocio: neg }) : [];
    const cMap = Object.fromEntries(cursos.map(c => [c.id, c.titulo]));
    const wb = XLSX.utils.book_new();

    // Vendas (competência, bruto)
    if (!soDespesas) add(wb, 'Vendas', vendas
      .sort((a, b) => b.data_venda.localeCompare(a.data_venda))
      .map(v => ({
        Data: NF.util.dataBR(v.data_venda), Cliente: v.cliente, Descrição: v.descricao || '',
        ...(neg === 'academy' ? { Curso: cMap[v.curso_id] || '' } : {}),
        'Bruto (R$)': v.valor_bruto, Forma: fMap[v.forma_pagamento_id] || '',
        Parcelas: v.num_parcelas, Vendedora: vMap[v.vendedora_id] || '',
      })));

    // Carteira a receber (projeção, líquido)
    if (!soDespesas) add(wb, 'A Receber', carteira
      .filter(p => p.status !== 'recebido')
      .sort((a, b) => a.data_prevista.localeCompare(b.data_prevista))
      .map(p => ({
        'Cai em': NF.util.dataBR(p.data_prevista), Cliente: p.cliente, Descrição: p.descricao || '',
        Parcela: `${p.parcela_num}/${p.total_parcelas}`, 'Líquido (R$)': p.valor_parcela_liquido,
        Status: NF.util.statusParcela(p),
      })));

    // Despesas / contas a pagar
    const desp = lanc.filter(l => l.tipo === 'despesa');
    add(wb, 'Despesas', desp
      .sort((a, b) => (b.vencimento || b.data).localeCompare(a.vencimento || a.data))
      .map(d => ({
        Vencimento: NF.util.dataBR(d.vencimento || d.data), Descrição: d.descricao || '',
        Categoria: d.categoria || '', ...(neg === 'academy' ? { Curso: cMap[d.curso_id] || '' } : {}),
        'Valor (R$)': d.valor,
        Situação: d.pago === true ? 'Paga' : ((d.vencimento || d.data) < NF.util.hoje() ? 'Vencida' : 'A vencer'),
      })));

    // Extras por empresa
    if (!soDespesas && neg === 'academy') {
      const alunas = await NF.data.list('alunas', { negocio: neg });
      const aberto = {}, atraso = {};
      carteira.forEach(p => {
        if (p.status !== 'recebido' && p.cliente) {
          aberto[p.cliente] = (aberto[p.cliente] || 0) + p.valor_parcela_liquido;
          if (p.data_prevista < NF.util.hoje()) atraso[p.cliente] = (atraso[p.cliente] || 0) + p.valor_parcela_liquido;
        }
      });
      add(wb, 'Alunas', alunas.map(a => ({
        Nome: a.nome, Contato: a.contato || '', Cidade: a.cidade || '', Estado: a.estado || '',
        'Em aberto (R$)': aberto[a.nome] || 0,
        Situação: (atraso[a.nome] || 0) > 0 ? 'Inadimplente' : ((aberto[a.nome] || 0) > 0 ? 'Devendo' : 'Em dia'),
      })));
      const rec = {}, des = {};
      vendas.forEach(v => { if (v.curso_id) rec[v.curso_id] = (rec[v.curso_id] || 0) + v.valor_bruto; });
      desp.forEach(d => { if (d.curso_id) des[d.curso_id] = (des[d.curso_id] || 0) + d.valor; });
      add(wb, 'Cursos', cursos.map(c => ({
        Curso: c.titulo, 'Receita (R$)': rec[c.id] || 0, 'Despesa (R$)': des[c.id] || 0,
        'Resultado (R$)': (rec[c.id] || 0) - (des[c.id] || 0),
      })));
    }
    if (!soDespesas && neg === 'naturefac') {
      const produtos = await NF.data.list('produtos', { negocio: neg });
      add(wb, 'Estoque', produtos.map(p => ({
        Produto: p.nome, Categoria: p.categoria || '', 'Custo (R$)': p.custo, 'Preço (R$)': p.preco_venda,
        Quantidade: p.quantidade, 'Estoque mín.': p.estoque_minimo,
      })));
    }

    const nome = NF_CONFIG.NEGOCIOS[neg].nome;
    XLSX.writeFile(wb, `NatureFace-${nome}-${soDespesas ? 'Despesas-' : ''}${NF.util.hoje()}.xlsx`);
    NF.ui.toast(soDespesas ? 'Despesas exportadas' : 'Excel exportado');
  }

  // Fechamento do mês: Excel consolidado das 3 empresas (Resumo + Receitas + Despesas).
  async function fechamento(mes) {
    if (typeof XLSX === 'undefined') { NF.ui.toast('Biblioteca de Excel não carregou', 'err'); return; }
    mes = mes || NF.util.mesDe(NF.util.hoje());
    const negocios = Object.keys(NF_CONFIG.NEGOCIOS);
    const nome = n => NF_CONFIG.NEGOCIOS[n].nome;
    const [lanc, cart, vendas] = await Promise.all([
      NF.data.list('lancamentos'), NF.data.list('carteira'), NF.data.list('vendas'),
    ]);
    const r2 = NF.util.round2;
    // Receita = faturamento: vendas (Yampi) + avulsas ('Pedido Yampi'/'Recebimento…' duplicariam)
    const ehDup = l => (l.categoria || '').startsWith('Recebimento') || l.categoria === 'Pedido Yampi';
    const vencOf = d => d.vencimento || d.data;
    const wb = XLSX.utils.book_new();

    // Aba 1 — Resumo por empresa
    let tR = 0, tD = 0, tC = 0;
    const resumo = negocios.map(n => {
      const rec = vendas.filter(v => v.negocio === n && NF.util.mesDe(v.data_venda) === mes).reduce((s, v) => s + v.valor_bruto, 0)
        + lanc.filter(l => l.negocio === n && l.tipo === 'receita' && !ehDup(l) && NF.util.mesDe(l.data) === mes).reduce((s, l) => s + l.valor, 0);
      const des = lanc.filter(l => l.negocio === n && l.tipo === 'despesa' && NF.util.mesDe(vencOf(l)) === mes).reduce((s, l) => s + l.valor, 0);
      const car = cart.filter(c => c.negocio === n && c.status !== 'recebido').reduce((s, c) => s + c.valor_parcela_liquido, 0);
      tR += rec; tD += des; tC += car;
      return { Empresa: nome(n), 'Receitas (R$)': r2(rec), 'Despesas (R$)': r2(des), 'Saldo (R$)': r2(rec - des), 'Carteira a receber (R$)': r2(car) };
    });
    resumo.push({ Empresa: 'TOTAL', 'Receitas (R$)': r2(tR), 'Despesas (R$)': r2(tD), 'Saldo (R$)': r2(tR - tD), 'Carteira a receber (R$)': r2(tC) });
    add(wb, 'Resumo', resumo);

    // Aba 2 — Receitas do mês (todas as empresas)
    const recRows = [
      ...vendas.filter(v => NF.util.mesDe(v.data_venda) === mes)
        .map(v => ({ _d: v.data_venda, Data: NF.util.dataBR(v.data_venda), Empresa: nome(v.negocio), Descrição: v.cliente || v.descricao || '', 'Valor (R$)': v.valor_bruto })),
      ...lanc.filter(l => l.tipo === 'receita' && !ehDup(l) && NF.util.mesDe(l.data) === mes)
        .map(l => ({ _d: l.data, Data: NF.util.dataBR(l.data), Empresa: nome(l.negocio), Descrição: l.descricao || '', 'Valor (R$)': l.valor })),
    ].sort((a, b) => a._d.localeCompare(b._d)).map(({ _d, ...r }) => r);
    add(wb, 'Receitas', recRows);

    // Aba 3 — Despesas do mês (todas as empresas)
    add(wb, 'Despesas', lanc
      .filter(l => l.tipo === 'despesa' && NF.util.mesDe(vencOf(l)) === mes)
      .sort((a, b) => vencOf(a).localeCompare(vencOf(b)))
      .map(d => ({ Vencimento: NF.util.dataBR(vencOf(d)), Empresa: nome(d.negocio), Descrição: d.descricao || '',
        Categoria: d.categoria || '', 'Valor (R$)': d.valor, Situação: d.pago === true ? 'Paga' : (vencOf(d) < NF.util.hoje() ? 'Vencida' : 'A vencer') })));

    XLSX.writeFile(wb, `NatureFace-Fechamento-${mes}.xlsx`);
    NF.ui.toast('Fechamento do mês exportado');
  }

  return { negocio, fechamento };
})();

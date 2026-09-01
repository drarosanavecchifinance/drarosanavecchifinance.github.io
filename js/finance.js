// finance.js — MOTOR FINANCEIRO compartilhado, sempre escopado por `negocio`.
// -----------------------------------------------------------------------------
// É código comum (layout-base), mas TODA consulta filtra pela empresa recebida —
// nada vaza entre NatureFace / Academy / Clínica. Cada empresa injeta suas
// abas-extra (estoque, alunas...) via `extras`, sem tocar neste arquivo.
// -----------------------------------------------------------------------------
const NFf = window.NF || (window.NF = {});

NF.finance = (() => {
  const el = NF.ui.el;
  // Pedidos da loja aparecem só com o código (sem o prefixo "Pedido Yampi").
  const soCodigo = v => (v || '').replace(/Pedido Yampi\s*/g, '');

  // Agrega os números de um negócio num período (mês corrente por padrão).
  async function resumo(negocio, mesRef) {
    const mes = mesRef || NF.util.mesDe(NF.util.hoje());
    const [lanc, cart, vendas] = await Promise.all([
      NF.data.list('lancamentos', { negocio }),
      NF.data.list('carteira', { negocio }),
      NF.data.list('vendas', { negocio }),
    ]);
    const vendasMes = vendas.filter(v => NF.util.mesDe(v.data_venda) === mes)
      .reduce((s, v) => s + v.valor_bruto, 0);                       // competência (bruto)
    const recebMes = cart.filter(c => c.status === 'recebido' && NF.util.mesDe(c.data_recebido) === mes)
      .reduce((s, c) => s + c.valor_parcela_liquido, 0);            // caixa (líquido)
    const carteira = cart.filter(c => c.status !== 'recebido')
      .reduce((s, c) => s + c.valor_parcela_liquido, 0);           // a receber (líquido)
    const despesasMes = lanc.filter(l => l.tipo === 'despesa' && NF.util.mesDe(l.data) === mes)
      .reduce((s, l) => s + l.valor, 0);
    // Receitas = FATURAMENTO do mês: vendas (Yampi/fluxo antigo) + receitas avulsas.
    // Exclui 'Pedido Yampi' e 'Recebimento…' dos lançamentos para não contar em dobro
    // (o pedido já está em vendas; o recebimento é caixa e vive na carteira).
    const ehDuplicado = l => (l.categoria || '').startsWith('Recebimento') || l.categoria === 'Pedido Yampi';
    const receitasMes = vendasMes + lanc
      .filter(l => l.tipo === 'receita' && !ehDuplicado(l) && NF.util.mesDe(l.data) === mes)
      .reduce((s, l) => s + l.valor, 0);
    const nVendasMes = vendas.filter(v => NF.util.mesDe(v.data_venda) === mes).length;
    return {
      mes, vendasMes, recebMes, carteira, despesasMes, receitasMes,
      saldoCaixa: receitasMes - despesasMes,
      resultadoComp: vendasMes - despesasMes,
      ticketMedio: nVendasMes ? vendasMes / nVendasMes : 0,
      nVendasMes,
    };
  }

  function cardMini(label, valor, cls) {
    return el('div', { class: `nf-mini ${cls || ''}` },
      el('span', { class: 'lbl' }, label),
      el('strong', {}, NF.util.brl(valor)));
  }

  async function render(negocio, mount, extras = []) {
    NF.ui.clear(mount);
    const state = { tab: 'resumo' };
    const tabs = [
      { id: 'resumo', label: 'Resumo' },
      // A aba Vendas foi descontinuada: as entradas ficam na aba Receitas,
      // que gera a carteira conforme o meio de pagamento.
      { id: 'carteira', label: 'Carteira' },
      { id: 'receitas', label: 'Receitas' },
      { id: 'despesas', label: 'Despesas' },
      { id: 'vendedoras', label: 'Vendedoras' },
      ...extras,
    ];

    const nav = el('div', { class: 'nf-subnav' });
    const body = el('div', { class: 'nf-fin-body' });
    mount.append(nav, body);

    async function go(id) {
      state.tab = id;
      [...nav.children].forEach(b => b.classList.toggle('active', b.dataset.id === id));
      NF.ui.clear(body);
      const ex = extras.find(e => e.id === id);
      if (ex) return ex.render(body, negocio);
      if (id === 'resumo') return viewResumo(negocio, body);
      if (id === 'vendas') return viewVendas(negocio, body, go);
      if (id === 'carteira') return viewCarteira(negocio, body);
      if (id === 'receitas') return viewReceitas(negocio, body);
      if (id === 'despesas') return viewDespesas(negocio, body);
      if (id === 'vendedoras') return viewVendedoras(negocio, body);
    }
    tabs.forEach(t => {
      const b = el('button', { class: 'nf-subtab', 'data-id': t.id, onclick: () => go(t.id) }, t.label);
      nav.append(b);
    });
    go('resumo');
  }

  // ---- RESUMO ----
  async function viewResumo(negocio, body, mesSel) {
    const [vendas, lanc] = await Promise.all([
      NF.data.list('vendas', { negocio }),
      NF.data.list('lancamentos', { negocio }),
    ]);
    const mesAtual = NF.util.mesDe(NF.util.hoje());
    // Meses com movimento (vendas ou despesas) + mês atual, mais recentes primeiro.
    const mesesSet = new Set([mesAtual]);
    vendas.forEach(v => mesesSet.add(NF.util.mesDe(v.data_venda)));
    lanc.forEach(l => mesesSet.add(NF.util.mesDe(l.vencimento || l.data)));
    const meses = [...mesesSet].sort().reverse();
    const mes = mesSel || mesAtual;   // padrão: mês atual

    const r = await resumo(negocio, mes);

    const sel = el('select', { class: 'nf-filter', onchange: e => viewResumo(negocio, NF.ui.clear(body), e.target.value) },
      ...meses.map(m => el('option', { value: m }, NF.util.mesLabel(m) + (m === mesAtual ? ' (atual)' : ''))));
    sel.value = mes;
    body.append(el('div', { class: 'nf-row-head' },
      el('div', { class: 'nf-filter-wrap' }, el('span', { class: 'nf-filter-lbl' }, 'Mês'), sel),
      el('span', {})));

    body.append(
      el('div', { class: 'nf-mini-grid' },
        cardMini('Receitas do mês', r.receitasMes, 'pos'),
        cardMini('Despesas do mês', r.despesasMes, 'neg'),
        cardMini('Saldo do mês', r.saldoCaixa, r.saldoCaixa >= 0 ? 'pos' : 'neg'),
      ),
    );
  }

  // Monta o seletor de mês (competência): meses com registro + faixa fixa de
  // 12 meses para trás e 6 à frente do atual, para poder navegar/planejar.
  function filtroMes(itens, campoData, mesSel, onChange) {
    const mesAtual = NF.util.mesDe(NF.util.hoje());
    const [anoA, mesA] = mesAtual.split('-').map(Number);
    const faixa = [];
    for (let i = -12; i <= 6; i++) {
      const d = new Date(anoA, mesA - 1 + i, 1);
      faixa.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const meses = [...new Set([...faixa, ...itens.map(i => NF.util.mesDe(i[campoData]))])].sort().reverse();
    const sel = el('select', { class: 'nf-filter', onchange: e => onChange(e.target.value) },
      el('option', { value: 'todos' }, 'Todos os meses'),
      ...meses.map(m => el('option', { value: m }, NF.util.mesLabel(m) + (m === mesAtual ? ' (atual)' : ''))));
    sel.value = mesSel || 'todos';
    return el('div', { class: 'nf-filter-wrap' }, el('span', { class: 'nf-filter-lbl' }, 'Mês'), sel);
  }

  // ---- VENDAS ----
  async function viewVendas(negocio, body, go, mesSel) {
    const [vendas, formas, vendedoras, cursos, alunas] = await Promise.all([
      NF.data.list('vendas', { negocio }),
      NF.data.list('formas_pagamento'),
      NF.data.list('vendedoras'),
      negocio === 'academy' ? NF.data.list('cursos', { negocio }) : Promise.resolve([]),
      negocio === 'academy' ? NF.data.list('alunas', { negocio }) : Promise.resolve([]),
    ]);
    const fMap = Object.fromEntries(formas.map(f => [f.id, f]));
    const vMap = Object.fromEntries(vendedoras.map(v => [v.id, v]));
    const cMap = Object.fromEntries(cursos.map(c => [c.id, c.titulo]));
    vendas.sort((a, b) => b.data_venda.localeCompare(a.data_venda));
    const mes = mesSel || NF.util.mesDe(NF.util.hoje());   // padrão: mês atual
    const rows = vendas.filter(v => mes === 'todos' || NF.util.mesDe(v.data_venda) === mes);

    body.append(el('div', { class: 'nf-row-head' },
      filtroMes(vendas, 'data_venda', mes, m => viewVendas(negocio, NF.ui.clear(body), go, m)),
      el('button', { class: 'btn', onclick: () => novaVenda(negocio, formas, vendedoras, cursos, alunas, () => viewVendas(negocio, NF.ui.clear(body), go, mes)) }, '+ Nova venda')));

    const total = rows.reduce((s, v) => s + v.valor_bruto, 0);
    body.append(el('p', { class: 'nf-hint' }, `${rows.length} venda(s) · faturamento ${NF.util.brl(total)}`));

    const cols = [
      { key: 'data_venda', label: 'Data', fmt: NF.util.dataBR },
      { key: 'cliente', label: 'Cliente' },
      { key: 'descricao', label: 'Descrição' },
      ...(negocio === 'academy' ? [{ key: 'curso_id', label: 'Curso', fmt: v => (cMap[v] || '—') }] : []),
      { key: 'valor_bruto', label: 'Bruto', fmt: v => NF.util.brl(v) },
      { key: 'forma_pagamento_id', label: 'Forma', fmt: v => (fMap[v]?.nome || '—') },
      { key: 'num_parcelas', label: 'Parc.' },
      { key: 'vendedora_id', label: 'Vendedora', fmt: v => (vMap[v]?.nome || '—') },
    ];
    const recarrega = () => viewVendas(negocio, NF.ui.clear(body), go, mes);
    body.append(NF.ui.table(cols, rows, (r) => [
      NF.ui.iconBtn('Editar', '', () => editarVenda(negocio, r, formas, vendedoras, cursos, alunas, recarrega)),
      NF.ui.iconBtn('Excluir', 'danger', async () => {
        if (!await NF.ui.confirm('Excluir a venda e suas parcelas?')) return;
        const cart = await NF.data.list('carteira', { venda_id: r.id });
        for (const c of cart) { if (c.lancamento_id) await NF.data.remove('lancamentos', c.lancamento_id); await NF.data.remove('carteira', c.id); }
        await NF.data.remove('vendas', r.id);
        NF.ui.toast('Venda excluída'); recarrega();
      }),
    ]));
  }

  // Campos do formulário de venda (compartilhado entre nova e edição). `v` = valores atuais (edição).
  // Se `alunas` for passado (Academy), o "Cliente" vira seleção/cadastro de ALUNA com dados.
  function camposVenda(formas, vendedoras, cursos, v = {}, alunas = null) {
    const campoCurso = (cursos && cursos.length)
      ? [{ name: 'curso_id', label: 'Curso (opcional)', type: 'select', value: v.curso_id || '',
          options: [{ value: '', label: '—' }, ...cursos.map(c => ({ value: c.id, label: c.titulo }))] }]
      : [];
    // Meios de pagamento (até 2). Prefill via v.pagamentos (edição) ou campos antigos.
    const fopt = formas.map(f => ({ value: f.id, label: `${f.nome} (taxa ${f.taxa_pct}%)` }));
    const p0 = (v.pagamentos && v.pagamentos[0]) || { forma_pagamento_id: v.forma_pagamento_id, valor: v.valor_bruto, num_parcelas: v.num_parcelas };
    const p1 = (v.pagamentos && v.pagamentos[1]) || {};

    // Bloco do cliente: Academy = aluna (selecionar existente ou cadastrar nova, com dados).
    let campoCliente;
    if (alunas) {
      const alunaAtual = alunas.find(a => a.nome === v.cliente);
      const preenche = (val, inputs) => {
        const a = alunas.find(x => x.id === val); if (!a) return;
        const set = (k, vv) => { if (inputs[k]) inputs[k].value = vv || ''; };
        set('nome', a.nome); set('telefone', a.telefone || a.contato); set('email', a.email);
        set('cpf', a.cpf); set('cep', a.cep); set('endereco', a.endereco); set('cidade', a.cidade); set('estado', a.estado);
      };
      campoCliente = [
        { name: 'aluna_id', label: 'Aluna existente', type: 'select', value: alunaAtual?.id || '', onChange: preenche,
          options: [{ value: '', label: '— nova aluna —' }, ...alunas.map(a => ({ value: a.id, label: a.nome }))] },
        { name: 'nome', label: 'Nome da aluna', required: true, value: v.cliente || '' },
        { name: 'telefone', label: 'Telefone', value: alunaAtual?.telefone || alunaAtual?.contato || '' },
        { name: 'email', label: 'E-mail', type: 'email', value: alunaAtual?.email || '' },
        { name: 'cpf', label: 'CPF', value: alunaAtual?.cpf || '' },
        { name: 'cep', label: 'CEP (preenche endereço)', placeholder: '00000-000', value: alunaAtual?.cep || '', onChange: (val, inputs) => NF.ui.buscaCep(val, inputs) },
        { name: 'endereco', label: 'Endereço', value: alunaAtual?.endereco || '' },
        { name: 'cidade', label: 'Cidade', value: alunaAtual?.cidade || '' },
        { name: 'estado', label: 'Estado (UF)', value: alunaAtual?.estado || '' },
      ];
    } else {
      campoCliente = [{ name: 'cliente', label: 'Cliente', required: true, value: v.cliente || '' }];
    }

    return [
      { name: 'data_venda', label: 'Data da venda', type: 'date', required: true, value: v.data_venda || NF.util.hoje() },
      ...campoCliente,
      { name: 'descricao', label: 'Descrição', value: v.descricao || '' },
      ...campoCurso,
      { name: 'forma1', label: 'Forma de pagamento', type: 'select', required: true, value: p0.forma_pagamento_id || '', options: fopt },
      { name: 'valor1', label: 'Valor', type: 'number', step: '0.01', required: true, value: p0.valor ?? '' },
      { name: 'parcelas1', label: 'Nº de parcelas (cartão)', type: 'number', value: p0.num_parcelas ?? 1 },
      { name: 'forma2', label: '2º meio de pagamento (opcional)', type: 'select', value: p1.forma_pagamento_id || '', options: [{ value: '', label: '—' }, ...fopt] },
      { name: 'valor2', label: 'Valor (2º meio)', type: 'number', step: '0.01', value: p1.valor ?? '' },
      { name: 'parcelas2', label: 'Nº de parcelas (2º meio)', type: 'number', value: p1.num_parcelas ?? 1 },
      { name: 'situacao', label: 'Situação', type: 'select', value: v.situacao || 'auto', options: [
        { value: 'auto', label: 'Automático (pela forma)' },
        { value: 'recebido', label: 'Recebido (tudo no caixa)' },
        { value: 'pendente', label: 'Pendente (tudo a receber)' },
      ] },
      { name: 'vendedora_id', label: 'Vendedora', type: 'select', value: v.vendedora_id || '',
        options: [{ value: '', label: '—' }, ...vendedoras.map(vd => ({ value: vd.id, label: vd.nome }))] },
    ];
  }

  // Academy: cria/atualiza a aluna com os dados do formulário e devolve o nome (=cliente).
  async function upsertAluna(negocio, d, alunas) {
    const nome = (d.nome || '').trim();
    if (!nome) return d.cliente;
    const dados = {};
    if (d.telefone) { dados.telefone = d.telefone; dados.contato = d.telefone; }
    if (d.email) dados.email = d.email;
    if (d.cpf) dados.cpf = d.cpf;
    if (d.cep) dados.cep = d.cep;
    if (d.endereco) dados.endereco = d.endereco;
    if (d.cidade) dados.cidade = d.cidade;
    if (d.estado) dados.estado = d.estado;
    const existente = (d.aluna_id && alunas.find(a => a.id === d.aluna_id)) || alunas.find(a => a.nome === nome);
    if (existente) await NF.data.update('alunas', existente.id, { nome, ...dados });
    else await NF.data.insert('alunas', { negocio, nome, ...dados });
    return nome;
  }

  // Monta os meios de pagamento a partir do formulário (1 ou 2).
  function pagamentosDe(d) {
    const pags = [{ forma_pagamento_id: d.forma1, valor: d.valor1, num_parcelas: d.parcelas1 }];
    if (d.forma2 && Number(d.valor2) > 0) pags.push({ forma_pagamento_id: d.forma2, valor: d.valor2, num_parcelas: d.parcelas2 });
    return pags;
  }

  function novaVenda(negocio, formas, vendedoras, cursos, alunas, onDone) {
    const usaAluna = negocio === 'academy';
    NF.ui.modal({
      title: 'Nova venda',
      campos: camposVenda(formas, vendedoras, cursos, {}, usaAluna ? alunas : null),
      submitLabel: 'Registrar venda',
      onSubmit: async (d) => {
        const cliente = usaAluna ? await upsertAluna(negocio, d, alunas) : d.cliente;
        await NF.data.registrarVenda({ negocio, cliente, descricao: d.descricao, data_venda: d.data_venda,
          curso_id: d.curso_id || null, situacao: d.situacao, vendedora_id: d.vendedora_id || null, pagamentos: pagamentosDe(d) });
        NF.ui.toast('Venda registrada — parcelas geradas na carteira'); onDone();
      },
    });
  }

  function editarVenda(negocio, venda, formas, vendedoras, cursos, alunas, onDone) {
    const usaAluna = negocio === 'academy';
    NF.ui.modal({
      title: 'Editar venda',
      campos: camposVenda(formas, vendedoras, cursos, venda, usaAluna ? alunas : null),
      submitLabel: 'Salvar alterações',
      onSubmit: async (d) => {
        const cliente = usaAluna ? await upsertAluna(negocio, d, alunas) : d.cliente;
        await NF.data.atualizarVenda(venda.id, { cliente, descricao: d.descricao, data_venda: d.data_venda,
          curso_id: d.curso_id || null, situacao: d.situacao, vendedora_id: d.vendedora_id || null, pagamentos: pagamentosDe(d) });
        NF.ui.toast('Venda atualizada — carteira ajustada'); onDone();
      },
    });
  }

  // ---- CARTEIRA ----
  // Carteira = 100% PROJEÇÃO. Só mostra o que ainda vai cair (parcelas a receber),
  // valor líquido (taxa já descontada), uma a cada ~31 dias. NÃO tem baixa aqui:
  // o recebimento se define no lançamento (forma imediata/entrada cai no caixa na hora).
  async function viewCarteira(negocio, body) {
    const cart = await NF.data.list('carteira', { negocio });
    const hoje = NF.util.hoje();
    // Baixa automática: parcela de cartão cai sozinha na data — ao abrir a
    // carteira, o que já venceu vira 'recebido' (na data prevista) e sai da lista.
    for (const p of cart.filter(p => p.status !== 'recebido' && p.data_prevista <= hoje)) {
      await NF.data.update('carteira', p.id, { status: 'recebido', data_recebido: p.data_prevista });
      p.status = 'recebido'; p.data_recebido = p.data_prevista;
    }
    // A receber = o que ainda vai cair; recebidas = o que já entrou (PIX no dia
    // da venda; parcelas de cartão baixadas automaticamente na data prevista).
    const aReceber = cart.filter(p => p.status !== 'recebido');
    const recebidas = cart.filter(p => p.status === 'recebido');
    aReceber.sort((a, b) => a.data_prevista.localeCompare(b.data_prevista));
    const totalLiq = aReceber.reduce((s, p) => s + p.valor_parcela_liquido, 0);
    const totalReceb = recebidas.reduce((s, p) => s + p.valor_parcela_liquido, 0);

    body.append(el('div', { class: 'nf-mini-grid' },
      el('div', { class: 'nf-mini accent' }, el('span', { class: 'lbl' }, 'A receber (líquido)'),
        el('strong', {}, NF.util.brl(totalLiq)), el('span', { class: 'nf-mini-sub' }, `${aReceber.length} parcela(s)`)),
      el('div', { class: 'nf-mini pos' }, el('span', { class: 'lbl' }, 'Recebido (líquido)'),
        el('strong', {}, NF.util.brl(totalReceb)), el('span', { class: 'nf-mini-sub' }, `${recebidas.length} parcela(s)`))));

    // Fluxo por mês: recebidas (pela data em que caíram) + previstas.
    const porMes = {};
    recebidas.forEach(p => { const m = NF.util.mesDe(p.data_recebido || p.data_prevista); porMes[m] = (porMes[m] || 0) + p.valor_parcela_liquido; });
    aReceber.forEach(p => { const m = NF.util.mesDe(p.data_prevista); porMes[m] = (porMes[m] || 0) + p.valor_parcela_liquido; });
    const meses = Object.keys(porMes).sort();
    if (meses.length) {
      body.append(el('h4', { class: 'nf-sub-h' }, 'Previsão por mês'));
      body.append(el('div', { class: 'nf-proj' }, ...meses.map(m =>
        el('div', { class: 'nf-proj-item' }, el('span', {}, NF.util.mesLabel(m)),
          el('strong', {}, NF.util.brl(porMes[m]))))));
    }

    // Lista da previsão — AGRUPADA por lançamento (venda). Cada venda = uma linha,
    // somando as parcelas ainda a receber. Só leitura.
    const grupos = {};
    aReceber.forEach(p => {
      // Sem venda associada (ex.: carteira importada), agrupa por cliente+descrição.
      const k = p.venda_id || `${p.cliente || ''}|${p.descricao || ''}`;
      (grupos[k] || (grupos[k] = [])).push(p);
    });
    const linhas = Object.values(grupos).map(ps => {
      ps.sort((a, b) => a.data_prevista.localeCompare(b.data_prevista));
      const total = ps.reduce((s, p) => s + p.valor_parcela_liquido, 0);
      const totalBruto = ps.reduce((s, p) => s + p.valor_parcela_bruto, 0);
      const atrasado = ps.some(p => p.data_prevista < hoje);
      return {
        cliente: ps[0].cliente, descricao: ps[0].descricao,
        n: ps.length, total_parcelas: ps[0].total_parcelas,
        valor_parcela: ps[0].valor_parcela_liquido,
        proxima: ps[0].data_prevista, total, totalBruto, status: atrasado ? 'atrasado' : 'previsto',
      };
    }).sort((a, b) => a.proxima.localeCompare(b.proxima));

    body.append(el('h4', { class: 'nf-sub-h' }, 'A receber por lançamento'));
    body.append(NF.ui.table([
      { key: 'proxima', label: 'Próx. venc.', fmt: NF.util.dataBR },
      { key: 'cliente', label: 'Cliente' },
      { key: 'descricao', label: 'Descrição', fmt: v => soCodigo(v) || '—' },
      { key: 'parcelas', label: 'Parcelas', fmt: (_, r) => r.n > 1 ? `${r.n}× ${NF.util.brl(r.valor_parcela)}` : '1×' },
      { key: 'totalBruto', label: 'Bruto', fmt: v => NF.util.brl(v) },
      { key: 'total', label: 'A receber (líq.)', fmt: v => `<span class="nf-num">${NF.util.brl(v)}</span>` },
      { key: 'status', label: 'Status', fmt: (_, r) => `<span class="nf-badge ${r.status}">${r.status}</span>` },
    ], linhas));

    // Já recebidas — PIX no dia da venda; parcela de cartão quando cai.
    if (recebidas.length) {
      recebidas.sort((a, b) => (b.data_recebido || '').localeCompare(a.data_recebido || ''));
      body.append(el('h4', { class: 'nf-sub-h' }, 'Recebidas'));
      body.append(NF.ui.table([
        { key: 'data_recebido', label: 'Recebido em', fmt: NF.util.dataBR },
        { key: 'cliente', label: 'Cliente' },
        { key: 'descricao', label: 'Descrição', fmt: v => soCodigo(v) || '—' },
        { key: 'parcela_num', label: 'Parcela', fmt: (_, r) => `${r.parcela_num}/${r.total_parcelas}` },
        { key: 'valor_parcela_liquido', label: 'Valor (líq.)', fmt: v => `<span class="nf-num">${NF.util.brl(v)}</span>` },
      ], recebidas));
    }
  }

  // ---- RECEITAS (faturamento do mês; gera a carteira conforme o meio de pagamento) ----
  async function viewReceitas(negocio, body, mesSel) {
    const [lancs, cursos, vendedoras, formas, vendas] = await Promise.all([
      NF.data.list('lancamentos', { negocio }).then(ls => ls.filter(l => l.tipo === 'receita')),
      negocio === 'academy' ? NF.data.list('cursos', { negocio }) : Promise.resolve([]),
      NF.data.list('vendedoras'),
      NF.data.list('formas_pagamento'),
      NF.data.list('vendas', { negocio }),
    ]);
    // Faturamento = vendas (Yampi/fluxo antigo, só leitura) + receitas avulsas.
    // 'Pedido Yampi' e 'Recebimento…' ficam de fora (duplicariam a venda / são caixa).
    const fMap = Object.fromEntries(formas.map(f => [f.id, f]));
    const avulsas = lancs.filter(l => !(l.categoria || '').startsWith('Recebimento') && l.categoria !== 'Pedido Yampi');
    const daVenda = vendas.map(v => ({
      _venda: true, id: v.id, data: v.data_venda,
      // Mostra o NOME DA CLIENTE; sem nome, cai no código do pedido.
      descricao: v.cliente || v.descricao || 'Venda',
      categoria: ((fMap[v.forma_pagamento_id]?.nome || '') + (v.num_parcelas > 1 ? ` ${v.num_parcelas}x` : '')).trim() || '—',
      curso_id: v.curso_id, vendedora_id: v.vendedora_id, valor: v.valor_bruto,
    }));
    const todas = [...avulsas, ...daVenda];
    const cMap = Object.fromEntries(cursos.map(c => [c.id, c.titulo]));
    const vMap = Object.fromEntries(vendedoras.map(v => [v.id, v.nome]));
    const mes = mesSel || NF.util.mesDe(NF.util.hoje());
    const reload = () => viewReceitas(negocio, NF.ui.clear(body), mes);

    const lista = (mes === 'todos') ? [...todas] : todas.filter(l => NF.util.mesDe(l.data) === mes);
    lista.sort((a, b) => b.data.localeCompare(a.data));   // mais recente primeiro
    const total = lista.reduce((s, l) => s + l.valor, 0);

    function abrirFormReceita(r) {
      const editando = !!r;
      NF.ui.modal({
        title: editando ? 'Editar receita' : 'Nova receita',
        campos: [
          { name: 'descricao', label: 'Descrição', required: true, value: r?.descricao || '' },
          // Meios de pagamento (1 ou 2): a receita é o FATURAMENTO (soma bruta, no mês
          // da venda); a carteira é gerada por meio — PIX cai no dia, cartão parcela.
          ...(editando ? [{ name: 'categoria', label: 'Forma pgto / categoria', value: r?.categoria || '' }] : [
            { name: 'forma_pagamento_id', label: 'Forma de pagamento', type: 'select', value: '',
              options: [{ value: '', label: '—' }, ...formas.map(f => ({ value: f.id, label: f.nome }))] },
            { name: 'parcelas', label: 'Parcelas (cartão crédito)', type: 'select', value: '1',
              options: Array.from({ length: 18 }, (_, i) => ({ value: String(i + 1), label: i === 0 ? 'À vista (1x)' : `${i + 1}x` })) },
            { name: 'valor', label: 'Valor (bruto) nessa forma', type: 'number', step: '0.01', required: true, value: '' },
            { name: 'forma2_id', label: '2ª forma de pagamento (opcional)', type: 'select', value: '',
              options: [{ value: '', label: '—' }, ...formas.map(f => ({ value: f.id, label: f.nome }))] },
            { name: 'parcelas2', label: 'Parcelas da 2ª forma', type: 'select', value: '1',
              options: Array.from({ length: 18 }, (_, i) => ({ value: String(i + 1), label: i === 0 ? 'À vista (1x)' : `${i + 1}x` })) },
            { name: 'valor2', label: 'Valor (bruto) na 2ª forma', type: 'number', step: '0.01', value: '' },
          ]),
          ...(cursos.length ? [{ name: 'curso_id', label: 'Curso (opcional)', type: 'select', value: r?.curso_id || '',
            options: [{ value: '', label: '—' }, ...cursos.map(c => ({ value: c.id, label: c.titulo }))] }] : []),
          { name: 'vendedora_id', label: 'Vendedora (opcional)', type: 'select', value: r?.vendedora_id || '',
            options: [{ value: '', label: '—' }, ...vendedoras.map(v => ({ value: v.id, label: v.nome }))] },
          ...(editando ? [{ name: 'valor', label: 'Valor (bruto da venda)', type: 'number', step: '0.01', required: true, value: r?.valor ?? '' }] : []),
          { name: 'data', label: 'Data da venda', type: 'date', required: true, value: r?.data || NF.util.hoje() },
        ],
        submitLabel: editando ? 'Salvar' : 'Lançar',
        onSubmit: async (d) => {
          if (editando) {
            await NF.data.update('lancamentos', r.id, { descricao: d.descricao, categoria: d.categoria,
              valor: d.valor, curso_id: d.curso_id || null, vendedora_id: d.vendedora_id || null, data: d.data });
            NF.ui.toast('Receita atualizada'); reload(); return;
          }
          // Monta os meios de pagamento (1 ou 2): cada um com forma, parcelas e valor.
          const meios = [];
          const f1 = formas.find(f => f.id === d.forma_pagamento_id);
          const v1 = parseFloat(d.valor) || 0;
          if (v1 > 0) meios.push({ forma: f1, n: f1?.tipo === 'cartao' ? Math.max(1, parseInt(d.parcelas || '1', 10)) : 1, valor: v1 });
          const f2 = formas.find(f => f.id === d.forma2_id);
          const v2 = parseFloat(d.valor2) || 0;
          if (f2 && v2 > 0) meios.push({ forma: f2, n: f2.tipo === 'cartao' ? Math.max(1, parseInt(d.parcelas2 || '1', 10)) : 1, valor: v2 });

          const total = NF.util.round2(meios.reduce((s, m) => s + m.valor, 0));
          const categoria = meios.map(m => (m.forma ? m.forma.nome + (m.n > 1 ? ` ${m.n}x` : '') : '')).filter(Boolean).join(' + ');
          // Receita = FATURAMENTO: soma bruta dos meios, no mês da venda.
          await NF.data.insert('lancamentos', { negocio, tipo: 'receita', descricao: d.descricao,
            categoria, valor: total, curso_id: d.curso_id || null, vendedora_id: d.vendedora_id || null, data: d.data });
          // Carteira por meio: imediata (PIX/dinheiro) entra RECEBIDA no dia da venda;
          // cartão/boleto entra prevista, uma parcela a cada ~31 dias, com a taxa
          // do negócio descontada no líquido.
          const cursoTitulo = cursos.find(c => c.id === d.curso_id)?.titulo || null;
          let nCart = 0;
          for (const m of meios) {
            if (!m.forma) continue;
            const imediata = !!m.forma.recebimento_imediato;
            const ps = NF.util.gerarParcelas(m.valor, d.data, m.n, m.forma, negocio);
            const sufixo = meios.filter(x => x.forma).length > 1 ? ` (${m.forma.nome})` : '';
            for (const p of ps) {
              await NF.data.insert('carteira', {
                venda_id: null, negocio, cliente: d.descricao, descricao: (cursoTitulo || '') + sufixo || null,
                valor_parcela_liquido: p.valor_parcela_liquido, valor_parcela_bruto: p.valor_parcela_bruto,
                parcela_num: p.parcela_num, total_parcelas: p.total_parcelas,
                data_prevista: p.data_prevista,
                status: imediata ? 'recebido' : 'previsto',
                data_recebido: imediata ? p.data_prevista : null,
                vendedora_id: d.vendedora_id || null, lancamento_id: null,
              });
              nCart++;
            }
          }
          NF.ui.toast(nCart ? `Receita de ${NF.util.brl(total)} lançada — ${nCart} parcela(s) na carteira` : 'Receita lançada');
          reload();
        },
      });
    }

    body.append(el('div', { class: 'nf-row-head' },
      filtroMes(todas, 'data', mes, m => viewReceitas(negocio, NF.ui.clear(body), m)),
      el('button', { class: 'btn', onclick: () => abrirFormReceita() }, '+ Nova receita')));
    body.append(el('div', { class: 'nf-mini-grid' },
      cardMini('Receitas no período', total, 'pos')));
    body.append(NF.ui.table([
      { key: 'data', label: 'Data', fmt: v => NF.util.dataBR(v) },
      { key: 'descricao', label: 'Descrição', fmt: v => soCodigo(v) || '—' },
      { key: 'categoria', label: 'Forma pgto' },
      ...(negocio === 'academy' ? [{ key: 'curso_id', label: 'Curso', fmt: v => (cMap[v] || '—') }] : []),
      { key: 'vendedora_id', label: 'Vendedora', fmt: v => (vMap[v] || '—') },
      { key: 'valor', label: 'Valor', fmt: v => NF.util.brl(v) },
    ], lista, (r) => r._venda ? [
      // Pedido Yampi: só a vendedora é editável aqui (o resto vem da loja).
      NF.ui.iconBtn('Editar', 'ghost', () => abrirFormVendaYampi(r)),
    ] : [
      NF.ui.iconBtn('Editar', 'ghost', () => abrirFormReceita(r)),
      NF.ui.iconBtn('Excluir', 'danger', async () => { await NF.data.remove('lancamentos', r.id); NF.ui.toast('Excluída'); reload(); }),
    ]));

    // Edita a vendedora de um pedido Yampi (venda) e propaga para as parcelas dele.
    function abrirFormVendaYampi(r) {
      NF.ui.modal({
        title: 'Pedido — vendedora',
        campos: [
          { name: 'vendedora_id', label: 'Vendedora', type: 'select', value: r.vendedora_id || '',
            options: [{ value: '', label: '—' }, ...vendedoras.map(v => ({ value: v.id, label: v.nome }))] },
        ],
        submitLabel: 'Salvar',
        onSubmit: async (d) => {
          const vid = d.vendedora_id || null;
          await NF.data.update('vendas', r.id, { vendedora_id: vid });
          const parcelas = await NF.data.list('carteira', { venda_id: r.id });
          for (const p of parcelas) await NF.data.update('carteira', p.id, { vendedora_id: vid });
          NF.ui.toast('Vendedora atualizada'); reload();
        },
      });
    }
  }

  // ---- DESPESAS (contas a pagar) ----
  // Cada despesa tem `vencimento` e `pago` (situação). O topo mostra o painel:
  // A vencer (futuras em aberto), Vencidas (passou a data, em aberto) e
  // Restante no mês (tudo em aberto com vencimento no mês atual).
  const vencOf = d => d.vencimento || d.data;          // fallback p/ despesas antigas
  const isPago = d => d.pago === true;
  // Soma meses a uma data ISO mantendo o dia (dia 31 em mês curto -> último dia do mês).
  const addMeses = (iso, n) => {
    const [y, m, dia] = iso.split('-').map(Number);
    const d = new Date(y, m - 1 + n, dia);
    if (d.getDate() !== dia) d.setDate(0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  async function viewDespesas(negocio, body, mesSel, filtroStatus, cursoSel) {
    const todasDesp = (await NF.data.list('lancamentos', { negocio })).filter(l => l.tipo === 'despesa');
    const cursos = negocio === 'academy' ? await NF.data.list('cursos', { negocio }) : [];
    const cMap = Object.fromEntries(cursos.map(c => [c.id, c.titulo]));
    const hoje = NF.util.hoje();
    const mesAtual = NF.util.mesDe(hoje);
    const mes = mesSel || mesAtual;                    // default: mês atual
    // Despesas do mês selecionado (por vencimento). 'todos' = todas.
    // Com curso selecionado, painel e lista mostram só as despesas dele.
    const doMes = mes === 'todos' ? todasDesp : todasDesp.filter(d => NF.util.mesDe(vencOf(d)) === mes);
    const desp = cursoSel ? doMes.filter(d => d.curso_id === cursoSel) : doMes;
    const pend = desp.filter(d => !isPago(d));
    const aVencer = pend.filter(d => vencOf(d) >= hoje);
    const vencidas = pend.filter(d => vencOf(d) < hoje);
    const restanteMes = pend;
    const pagoMes = desp.filter(d => isPago(d));
    const sum = arr => arr.reduce((s, d) => s + d.valor, 0);

    const reload = () => viewDespesas(negocio, NF.ui.clear(body), mes, filtroStatus, cursoSel);

    // Filtro de mês (o mês atual sempre aparece) + busca por texto.
    // A busca filtra as linhas da lista na hora (descrição/categoria/valor),
    // sem recarregar; para procurar em tudo, escolha "Todos os meses".
    const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    let tabela;
    const buscaInput = el('input', { class: 'nf-filter', type: 'search', placeholder: '🔍 Buscar despesa…',
      oninput: () => {
        const q = norm(buscaInput.value);
        if (tabela) [...tabela.querySelectorAll('tbody tr')].forEach(tr => {
          tr.style.display = !q || norm(tr.textContent).includes(q) ? '' : 'none';
        });
      } });
    // Filtro por curso (Academy): recalcula painel e lista para o curso escolhido.
    let selCurso = null;
    if (cursos.length) {
      selCurso = el('select', { class: 'nf-filter',
        onchange: e => viewDespesas(negocio, NF.ui.clear(body), mes, filtroStatus, e.target.value || null) },
        el('option', { value: '' }, 'Todos os cursos'),
        ...cursos.map(c => el('option', { value: c.id }, c.titulo)));
      selCurso.value = cursoSel || '';
    }
    body.append(el('div', { class: 'nf-row-head' },
      el('div', { style: 'display:flex; align-items:center; gap:10px; flex-wrap:wrap;' },
        filtroMes(todasDesp.map(d => ({ v: vencOf(d) })), 'v', mes, m => viewDespesas(negocio, NF.ui.clear(body), m, filtroStatus, cursoSel)),
        selCurso),
      buscaInput));

    // Painel de contas a pagar — clicáveis: filtram a lista abaixo.
    const card = (lbl, arr, cls, key) => el('div', {
      class: `nf-mini ${cls} nf-mini-click${filtroStatus === key ? ' active' : ''}`,
      onclick: () => viewDespesas(negocio, NF.ui.clear(body), mes, filtroStatus === key ? null : key, cursoSel),
    }, el('span', { class: 'lbl' }, lbl), el('strong', {}, NF.util.brl(sum(arr))), el('span', { class: 'nf-mini-sub' }, `${arr.length} conta(s)`));
    body.append(el('div', { class: 'nf-mini-grid' },
      card('A vencer', aVencer, 'warn', 'a_vencer'),
      card('Vencidas', vencidas, 'neg', 'vencidas'),
      card('Restante no mês', restanteMes, 'accent', 'restante'),
      card('Pago no mês', pagoMes, 'pos', 'pago'),
    ));
    if (vencidas.length) body.append(el('div', { class: 'nf-alert' },
      `⚠ ${vencidas.length} conta(s) vencida(s) somando ${NF.util.brl(sum(vencidas))} em aberto.`));

    // Lista (filtrada pelo card clicado; ordenada por vencimento mais próximo)
    const SUBSETS = { a_vencer: aVencer, vencidas, restante: restanteMes, pago: pagoMes };
    const LABELS = { a_vencer: 'A vencer', vencidas: 'Vencidas', restante: 'Restante no mês', pago: 'Pago no mês' };
    const lista = (filtroStatus && SUBSETS[filtroStatus]) ? SUBSETS[filtroStatus] : desp;
    lista.sort((a, b) => vencOf(b).localeCompare(vencOf(a)));   // mais recente primeiro
    body.append(el('div', { class: 'nf-row-head' },
      el('div', { style: 'display:flex; align-items:center; gap:12px; flex-wrap:wrap;' },
        el('h4', {}, filtroStatus ? `${LABELS[filtroStatus]} (${lista.length})` : 'Contas / despesas'),
        filtroStatus ? el('button', { class: 'btn ghost tiny', onclick: () => viewDespesas(negocio, NF.ui.clear(body), mes, null, cursoSel) }, 'Ver todas') : null),
      el('button', { class: 'btn', onclick: () => abrirFormDespesa() }, '+ Nova despesa')));

    // Formulário compartilhado: Nova despesa (r=null) e Editar (r=lançamento existente).
    function abrirFormDespesa(r) {
      const editando = !!r;
      NF.ui.modal({
        title: editando ? 'Editar despesa' : 'Nova despesa',
        campos: [
          { name: 'descricao', label: 'Descrição', required: true, value: r?.descricao || '' },
          { name: 'categoria', label: 'Categoria', value: r?.categoria || '' },
          ...(cursos.length ? [{ name: 'curso_id', label: 'Curso (opcional)', type: 'select', value: r?.curso_id || '',
            options: [{ value: '', label: '—' }, ...cursos.map(c => ({ value: c.id, label: c.titulo }))] }] : []),
          { name: 'valor', label: 'Valor', type: 'number', step: '0.01', required: true, value: r?.valor ?? '' },
          ...(editando ? [] : [{ name: 'parcelas', label: 'Parcelas (divide o valor total)', type: 'select', value: '1',
            options: Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: i === 0 ? 'À vista (1x)' : `${i + 1}x` })) }]),
          { name: 'vencimento', label: editando ? 'Vencimento' : 'Vencimento (da 1ª parcela)', type: 'date', required: true, value: r ? vencOf(r) : hoje },
          ...(editando ? [] : [{ name: 'venc2', label: 'Vencimento da 2ª parcela (opcional — se vazio, 1 mês após a 1ª)', type: 'date', value: '' }]),
          { name: 'pago', label: 'Situação', type: 'select', value: r && isPago(r) ? 'sim' : 'nao', options: [
            { value: 'nao', label: 'Em aberto' }, { value: 'sim', label: 'Já paga' }] },
        ],
        submitLabel: editando ? 'Salvar' : 'Lançar',
        onSubmit: async (d) => {
          const pago = d.pago === 'sim';
          const nParc = editando ? 1 : Math.max(1, parseInt(d.parcelas || '1', 10));
          if (nParc > 1) {
            // Parcelado: divide o valor total em N lançamentos com vencimentos mensais.
            // A 1ª parcela vence em `vencimento`; a 2ª em `venc2` (ou 1 mês após a 1ª)
            // e as seguintes de mês em mês a partir da 2ª.
            // A situação escolhida vale só para a 1ª parcela; as demais ficam em aberto.
            const total = parseFloat(d.valor);
            const base = NF.util.round2(total / nParc);
            const venc2 = d.venc2 || addMeses(d.vencimento, 1);
            for (let i = 1; i <= nParc; i++) {
              const valor = i === nParc ? NF.util.round2(total - base * (nParc - 1)) : base;
              const venc = i === 1 ? d.vencimento : addMeses(venc2, i - 2);
              const pagoParc = pago && i === 1;
              await NF.data.insert('lancamentos', {
                negocio, tipo: 'despesa', descricao: `${d.descricao} (${i}/${nParc})`,
                categoria: d.categoria, valor, curso_id: d.curso_id || null,
                vencimento: venc, data: venc, pago: pagoParc,
                data_pagamento: pagoParc ? hoje : null,
              });
            }
            NF.ui.toast(`Despesa lançada em ${nParc}x`);
            return reload();
          }
          const campos = {
            descricao: d.descricao, categoria: d.categoria, valor: d.valor,
            curso_id: d.curso_id || null, vencimento: d.vencimento, data: d.vencimento, pago,
            // ao marcar como paga mantém a data original de pagamento se já existia, senão hoje.
            data_pagamento: pago ? (r?.data_pagamento || hoje) : null,
          };
          if (editando) { await NF.data.update('lancamentos', r.id, campos); NF.ui.toast('Despesa atualizada'); }
          else { await NF.data.insert('lancamentos', { negocio, tipo: 'despesa', ...campos }); NF.ui.toast('Despesa lançada'); }
          reload();
        },
      });
    }

    const statusBadge = (d) => {
      if (isPago(d)) return '<span class="nf-badge recebido">paga</span>';
      if (vencOf(d) < hoje) return '<span class="nf-badge atrasado">vencida</span>';
      return '<span class="nf-badge previsto">a vencer</span>';
    };
    tabela = NF.ui.table([
      { key: 'vencimento', label: 'Vencimento', fmt: (_, r) => NF.util.dataBR(vencOf(r)) },
      { key: 'descricao', label: 'Descrição' },
      { key: 'categoria', label: 'Categoria' },
      ...(negocio === 'academy' ? [{ key: 'curso_id', label: 'Curso', fmt: v => (cMap[v] || '—') }] : []),
      { key: 'valor', label: 'Valor', fmt: v => NF.util.brl(v) },
      { key: 'status', label: 'Status', fmt: (_, r) => statusBadge(r) },
    ], lista, (r) => [
      isPago(r)
        ? null
        : NF.ui.iconBtn('Pagar', '', async () => { await NF.data.update('lancamentos', r.id, { pago: true, data_pagamento: NF.util.hoje() }); NF.ui.toast('Marcada como paga'); reload(); }),
      NF.ui.iconBtn('Editar', 'ghost', () => abrirFormDespesa(r)),
      NF.ui.iconBtn('Excluir', 'danger', async () => { await NF.data.remove('lancamentos', r.id); NF.ui.toast('Excluída'); reload(); }),
    ].filter(Boolean));
    body.append(tabela);
  }

  // ---- VENDEDORAS (cadastro compartilhado) ----
  async function viewVendedoras(negocio, body) {
    const vendedoras = await NF.data.list('vendedoras');
    body.append(el('div', { class: 'nf-row-head' },
      el('h4', {}, 'Vendedoras'),
      el('button', { class: 'btn', onclick: () => NF.ui.modal({
        title: 'Nova vendedora',
        campos: [{ name: 'nome', label: 'Nome', required: true }, { name: 'contato', label: 'Contato' }],
        submitLabel: 'Cadastrar',
        onSubmit: async (d) => { await NF.data.insert('vendedoras', { ...d, comissao_pct: 0, ativo: true }); NF.ui.toast('Cadastrada'); viewVendedoras(negocio, NF.ui.clear(body)); },
      }) }, '+ Nova vendedora')));

    // Total vendido por vendedora NESTE negócio (ranking simples, sem comissão).
    const vendas = await NF.data.list('vendas', { negocio });
    const totalPorV = {};
    vendas.forEach(v => { if (v.vendedora_id) totalPorV[v.vendedora_id] = (totalPorV[v.vendedora_id] || 0) + v.valor_bruto; });

    body.append(NF.ui.table([
      { key: 'nome', label: 'Nome' },
      { key: 'contato', label: 'Contato' },
      { key: 'total', label: `Vendido (${NF_CONFIG.NEGOCIOS[negocio].nome})`, fmt: (_, r) => NF.util.brl(totalPorV[r.id] || 0) },
    ], vendedoras, (r) => [NF.ui.iconBtn('Excluir', 'danger', async () => { await NF.data.remove('vendedoras', r.id); NF.ui.toast('Excluída'); viewVendedoras(negocio, NF.ui.clear(body)); })]));
  }

  return { render, resumo };
})();

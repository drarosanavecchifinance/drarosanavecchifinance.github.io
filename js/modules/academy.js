// modules/academy.js — Academy: só financeiro + controle de alunas e cursos.
// Sem parte pública (decisão do usuário). Isolado das outras empresas.
const NFac = window.NF || (window.NF = {});
NF.modules = NF.modules || {};

NF.modules.academy = (() => {
  const el = NF.ui.el;
  const NEG = 'academy';

  const extras = [
    { id: 'alunas', label: 'Alunas', render: viewAlunas },
    { id: 'cursos', label: 'Cursos', render: viewCursos },
  ];

  async function viewAlunas(body) {
    const [alunas, carteira] = await Promise.all([
      NF.data.list('alunas', { negocio: NEG }),
      NF.data.list('carteira', { negocio: NEG }),
    ]);
    // Saldo em aberto por aluna (carteira não recebida). Se houver parcela vencida,
    // é "Inadimplente"; se só tem saldo a vencer, é "Devendo"; senão, "Em dia".
    const hoje = NF.util.hoje();
    const abertoPorNome = {}, atrasoPorNome = {};
    carteira.forEach(p => {
      if (p.status !== 'recebido' && p.cliente) {
        abertoPorNome[p.cliente] = (abertoPorNome[p.cliente] || 0) + p.valor_parcela_liquido;
        if (p.data_prevista < hoje) atrasoPorNome[p.cliente] = (atrasoPorNome[p.cliente] || 0) + p.valor_parcela_liquido;
      }
    });
    const situacao = (r) => {
      const atraso = atrasoPorNome[r.nome] || 0, aberto = abertoPorNome[r.nome] || 0;
      if (atraso > 0) return `<span class="nf-badge atrasado">Inadimplente</span> <span class="nf-num neg">${NF.util.brl(aberto)}</span>`;
      if (aberto > 0) return `<span class="nf-badge previsto">Devendo</span> <span class="nf-num">${NF.util.brl(aberto)}</span>`;
      return `<span class="nf-badge recebido">Em dia</span>`;
    };

    body.append(el('div', { class: 'nf-row-head' },
      el('h4', {}, 'Alunas'),
      el('button', { class: 'btn', onclick: () => NF.ui.modal({
        title: 'Nova aluna',
        campos: camposAluna(),
        submitLabel: 'Cadastrar',
        onSubmit: async (d) => { await NF.data.insert('alunas', { negocio: NEG, contato: d.telefone, ...d }); NF.ui.toast('Aluna cadastrada'); viewAlunas(NF.ui.clear(body)); },
      }) }, '+ Nova aluna')));

    body.append(NF.ui.table([
      { key: 'nome', label: 'Nome' },
      { key: 'telefone', label: 'Telefone', fmt: (v, r) => v || r.contato || '—' },
      { key: 'cidade', label: 'Cidade', fmt: v => v || '—' },
      { key: 'estado', label: 'Estado', fmt: v => v || '—' },
      { key: 'situacao', label: 'Situação', fmt: (_, r) => situacao(r) },
    ], alunas, (r) => {
      const aberto = abertoPorNome[r.nome] || 0;
      const acoes = [NF.ui.iconBtn('Editar', 'ghost', () => editarAluna(r, body))];
      if (aberto > 0) acoes.unshift(NF.ui.iconBtn('Receber', '', () => receberAluna(r, aberto, body)));
      return acoes;
    }));
  }

  // Campos do cadastro de aluna (nova/edição), com CEP que auto-preenche endereço.
  function camposAluna(v = {}) {
    return [
      { name: 'nome', label: 'Nome', required: true, value: v.nome || '' },
      { name: 'telefone', label: 'Telefone', value: v.telefone || v.contato || '' },
      { name: 'email', label: 'E-mail', type: 'email', value: v.email || '' },
      { name: 'cpf', label: 'CPF', value: v.cpf || '' },
      { name: 'cep', label: 'CEP (preenche endereço)', value: v.cep || '', placeholder: '00000-000', onChange: (val, inputs) => NF.ui.buscaCep(val, inputs) },
      { name: 'endereco', label: 'Endereço', value: v.endereco || '' },
      { name: 'cidade', label: 'Cidade', value: v.cidade || '' },
      { name: 'estado', label: 'Estado (UF)', value: v.estado || '' },
      { name: 'observacoes', label: 'Observações', type: 'textarea', value: v.observacoes || '' },
    ];
  }

  function editarAluna(aluna, body) {
    NF.ui.modal({
      title: `Editar ${aluna.nome}`,
      campos: camposAluna(aluna),
      submitLabel: 'Salvar',
      onSubmit: async (d) => { await NF.data.update('alunas', aluna.id, { contato: d.telefone, ...d }); NF.ui.toast('Aluna atualizada'); viewAlunas(NF.ui.clear(body)); },
    });
  }

  // Recebe pagamento da dívida de uma aluna (baixa a carteira dela + entra no caixa).
  async function receberAluna(aluna, aberto, body) {
    const formas = await NF.data.list('formas_pagamento');
    NF.ui.modal({
      title: `Receber de ${aluna.nome}`,
      campos: [
        { name: 'valor', label: `Valor recebido (em aberto: ${NF.util.brl(aberto)})`, type: 'number', step: '0.01', required: true, value: aberto },
        { name: 'data', label: 'Data do pagamento', type: 'date', value: NF.util.hoje() },
        { name: 'forma_id', label: 'Meio de pagamento', type: 'select', options: [{ value: '', label: '—' }, ...formas.map(f => ({ value: f.id, label: f.nome }))] },
      ],
      submitLabel: 'Registrar pagamento',
      onSubmit: async (d) => {
        const fnome = formas.find(f => f.id === d.forma_id)?.nome;
        const aplicado = await NF.data.receberDaAluna(NEG, aluna.nome, d.valor, d.data || NF.util.hoje(), fnome);
        NF.ui.toast(`Recebido ${NF.util.brl(aplicado)} de ${aluna.nome}`);
        viewAlunas(NF.ui.clear(body));
      },
    });
  }

  async function matricular(aluna, cursos, body) {
    const vendedoras = await NF.data.list('vendedoras');
    NF.ui.modal({
      title: `Matricular ${aluna.nome}`,
      campos: [
        { name: 'curso_id', label: 'Curso', type: 'select', required: true, options: cursos.map(c => ({ value: c.id, label: `${c.titulo} — ${NF.util.brl(c.preco)}` })) },
        { name: 'data', label: 'Data', type: 'date', value: NF.util.hoje() },
        { name: 'valor', label: 'Valor', type: 'number', step: '0.01', required: true },
        { name: 'vendedora_id', label: 'Vendedora', type: 'select', options: [{ value: '', label: '—' }, ...vendedoras.map(v => ({ value: v.id, label: v.nome }))] },
      ],
      submitLabel: 'Matricular',
      onSubmit: async (d) => {
        await NF.data.insert('matriculas', { negocio: NEG, aluna_id: aluna.id, status: 'ativa', ...d, vendedora_id: d.vendedora_id || null });
        NF.ui.toast('Matrícula criada (lance a entrada na aba Receitas para faturar)'); viewAlunas(NF.ui.clear(body));
      },
    });
  }

  async function viewCursos(body, filtro) {
    const [cursos, vendas, lanc] = await Promise.all([
      NF.data.list('cursos', { negocio: NEG }),
      NF.data.list('vendas', { negocio: NEG }),
      NF.data.list('lancamentos', { negocio: NEG }),
    ]);
    // Receita × despesa por curso (o "dashboard" resumido de cada linha).
    const receita = {}, despesa = {};
    vendas.forEach(v => { if (v.curso_id) receita[v.curso_id] = (receita[v.curso_id] || 0) + v.valor_bruto; });
    lanc.forEach(l => { if (l.tipo === 'receita' && l.curso_id) receita[l.curso_id] = (receita[l.curso_id] || 0) + l.valor; });
    lanc.forEach(l => { if (l.tipo === 'despesa' && l.curso_id) despesa[l.curso_id] = (despesa[l.curso_id] || 0) + l.valor; });
    const resultadoHtml = (r) => {
      const res = (receita[r.id] || 0) - (despesa[r.id] || 0);
      const cls = res >= 0 ? 'pos' : 'neg';
      return `<span class="nf-num ${cls}">${NF.util.brl(res)}</span>`;
    };

    // Filtro por tipo: Protocolo NatureFace × PFI (Formação Internacional).
    const ehPFI = c => /pfi|formação|internacional|boston/i.test(c.titulo || '');
    const filtrados = filtro === 'pfi' ? cursos.filter(ehPFI)
      : filtro === 'protocolo' ? cursos.filter(c => !ehPFI(c)) : cursos;
    const btnFiltro = (id, lbl) => el('button', {
      class: 'btn' + (filtro === id ? '' : ' ghost'),
      onclick: () => viewCursos(NF.ui.clear(body), filtro === id ? null : id),
    }, lbl);

    body.append(el('div', { class: 'nf-row-head' },
      el('div', { style: 'display:flex; align-items:center; gap:10px; flex-wrap:wrap;' },
        el('h4', {}, 'Cursos'),
        btnFiltro('protocolo', 'Protocolo NatureFace'),
        btnFiltro('pfi', 'PFI')),
      el('button', { class: 'btn', onclick: () => NF.ui.modal({
        title: 'Novo curso',
        campos: [
          { name: 'titulo', label: 'Título', required: true },
          { name: 'descricao', label: 'Descrição', type: 'textarea' },
          { name: 'vagas', label: 'Vagas', type: 'number' },
        ],
        submitLabel: 'Cadastrar',
        onSubmit: async (d) => { await NF.data.insert('cursos', { negocio: NEG, ativo: true, ...d }); NF.ui.toast('Curso cadastrado'); viewCursos(NF.ui.clear(body)); },
      }) }, '+ Novo curso')));

    body.append(el('p', { class: 'nf-hint' }, 'Cada curso mostra sua receita e despesa. Clique em “Abrir” para o detalhamento.'));
    const stat = (lbl, val, cls) => el('div', {},
      el('span', {}, lbl), el('strong', { class: cls || '' }, NF.util.brl(val)));
    const grid = el('div', { class: 'nf-curso-grid' });
    filtrados.forEach(c => {
      const rec = receita[c.id] || 0, des = despesa[c.id] || 0, res = rec - des;
      grid.append(el('div', { class: 'nf-curso-card' },
        el('h4', {}, c.titulo),
        el('div', { class: 'nf-curso-stats' },
          stat('Receita', rec, ''),
          stat('Despesa', des, 'neg'),
          stat('Resultado', res, res >= 0 ? 'pos' : 'neg')),
        el('div', { class: 'nf-curso-actions' },
          el('button', { class: 'btn', onclick: () => cursoDashboard(NF.ui.clear(body), c) }, 'Abrir'),
          el('button', { class: 'btn danger', onclick: async () => { await NF.data.remove('cursos', c.id); NF.ui.toast('Excluído'); viewCursos(NF.ui.clear(body)); } }, 'Excluir'))));
    });
    if (!filtrados.length) grid.append(el('p', { class: 'nf-hint' }, filtro ? 'Nenhum curso nesse filtro.' : 'Nenhum curso cadastrado ainda.'));
    body.append(grid);
  }

  // ---- Dashboard de um curso: receita (vendas anexadas) × despesas (anexadas) ----
  async function cursoDashboard(body, curso) {
    const [vendas, lanc] = await Promise.all([
      NF.data.list('vendas', { negocio: NEG }),
      NF.data.list('lancamentos', { negocio: NEG }),
    ]);
    const vs = vendas.filter(v => v.curso_id === curso.id);
    const rs = lanc.filter(l => l.tipo === 'receita' && l.curso_id === curso.id);
    const ds = lanc.filter(l => l.tipo === 'despesa' && l.curso_id === curso.id);
    const receita = vs.reduce((s, v) => s + v.valor_bruto, 0) + rs.reduce((s, l) => s + l.valor, 0);
    const despesas = ds.reduce((s, l) => s + l.valor, 0);
    const resultado = receita - despesas;

    body.append(el('div', { class: 'nf-row-head' },
      el('h4', {}, `Curso · ${curso.titulo}`),
      el('div', { style: 'display:flex; gap:8px;' },
        el('button', { class: 'btn', onclick: () => lancarParaAluna(curso, body) }, '+ Lançar para aluna'),
        el('button', { class: 'btn ghost', onclick: () => viewCursos(NF.ui.clear(body)) }, '← Voltar'))));

    const card = (lbl, val, cls) => el('div', { class: `nf-mini ${cls}` },
      el('span', { class: 'lbl' }, lbl), el('strong', {}, NF.util.brl(val)));
    body.append(el('div', { class: 'nf-mini-grid' },
      card('Receita', receita, 'accent'),
      card('Despesas', despesas, 'neg'),
      card('Resultado', resultado, resultado >= 0 ? 'pos' : 'neg'),
    ));

    body.append(el('h4', { class: 'nf-sub-h' }, 'Vendas do curso'));
    body.append(NF.ui.table([
      { key: 'data_venda', label: 'Data', fmt: NF.util.dataBR },
      { key: 'cliente', label: 'Cliente' },
      { key: 'descricao', label: 'Descrição' },
      { key: 'valor_bruto', label: 'Valor', fmt: v => NF.util.brl(v) },
    ], vs.sort((a, b) => b.data_venda.localeCompare(a.data_venda))));

    body.append(el('h4', { class: 'nf-sub-h' }, 'Despesas do curso'));
    body.append(NF.ui.table([
      { key: 'vencimento', label: 'Vencimento', fmt: (_, r) => NF.util.dataBR(r.vencimento || r.data) },
      { key: 'descricao', label: 'Descrição' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'valor', label: 'Valor', fmt: v => NF.util.brl(v) },
    ], ds.sort((a, b) => (b.vencimento || b.data).localeCompare(a.vencimento || a.data))));
  }

  // Lançar um valor X para uma aluna dentro do curso; o saldo Y vira dívida dela
  // (entra na carteira como a receber e aparece na aba Alunas como devedora).
  async function lancarParaAluna(curso, body) {
    const [alunas, vendedoras, formas] = await Promise.all([
      NF.data.list('alunas', { negocio: NEG }),
      NF.data.list('vendedoras'),
      NF.data.list('formas_pagamento'),
    ]);
    const optForma = [{ value: '', label: '—' }, ...formas.map(f => ({ value: f.id, label: f.nome }))];
    const nomeForma = id => (formas.find(f => f.id === id)?.nome) || '';
    NF.ui.modal({
      title: `Lançar em ${curso.titulo}`,
      campos: [
        { name: 'aluna_id', label: 'Aluna', type: 'select', required: true, options: alunas.map(a => ({ value: a.id, label: a.nome })) },
        { name: 'valor_total', label: 'Valor total (X)', type: 'number', step: '0.01', required: true },
        // Entrada em até DOIS meios de pagamento
        { name: 'forma1', label: 'Pagamento 1 — meio', type: 'select', options: optForma },
        { name: 'valor1', label: 'Pagamento 1 — valor', type: 'number', step: '0.01', value: 0 },
        { name: 'forma2', label: 'Pagamento 2 — meio (opcional)', type: 'select', options: optForma },
        { name: 'valor2', label: 'Pagamento 2 — valor', type: 'number', step: '0.01', value: 0 },
        { name: 'vencimento', label: 'Vencimento do saldo devedor', type: 'date', value: NF.util.addDias(NF.util.hoje(), 30) },
        { name: 'vendedora_id', label: 'Vendedora', type: 'select', options: [{ value: '', label: '—' }, ...vendedoras.map(v => ({ value: v.id, label: v.nome }))] },
      ],
      submitLabel: 'Lançar',
      onSubmit: async (d) => {
        const aluna = alunas.find(a => a.id === d.aluna_id);
        const X = d.valor_total, vend = d.vendedora_id || null, hoje = NF.util.hoje();
        const pagamentos = [{ forma: d.forma1, valor: d.valor1 || 0 }, { forma: d.forma2, valor: d.valor2 || 0 }]
          .filter(p => p.valor > 0);
        let pago = NF.util.round2(pagamentos.reduce((s, p) => s + p.valor, 0));
        if (pago > X) pago = X;                       // não deixa pagar mais que o total
        const Y = NF.util.round2(X - pago);
        // Venda = receita/faturamento do curso (competência), valor total X.
        const venda = await NF.data.insert('vendas', {
          negocio: NEG, cliente: aluna.nome, descricao: `Curso ${curso.titulo}`, valor_bruto: X,
          data_venda: hoje, forma_pagamento_id: null, num_parcelas: 1, taxa_pct_aplicada: 0,
          curso_id: curso.id, vendedora_id: vend,
        });
        // Cada meio de pagamento da entrada → cai no caixa hoje.
        for (const pg of pagamentos) {
          const fnome = nomeForma(pg.forma);
          const linha = await NF.data.insert('carteira', {
            venda_id: venda.id, negocio: NEG, cliente: aluna.nome,
            descricao: `Curso ${curso.titulo} (entrada${fnome ? ' ' + fnome : ''})`,
            valor_parcela_liquido: pg.valor, valor_parcela_bruto: pg.valor, parcela_num: 1, total_parcelas: 1,
            data_prevista: hoje, status: 'previsto', data_recebido: null, vendedora_id: vend, lancamento_id: null,
          });
          await NF.data.receberParcela(linha.id, hoje);
        }
        // Saldo devedor Y → carteira a receber (fica devendo).
        if (Y > 0) {
          await NF.data.insert('carteira', {
            venda_id: venda.id, negocio: NEG, cliente: aluna.nome, descricao: `Curso ${curso.titulo} (saldo)`,
            valor_parcela_liquido: Y, valor_parcela_bruto: Y, parcela_num: 1, total_parcelas: 1,
            data_prevista: d.vencimento, status: 'previsto', data_recebido: null, vendedora_id: vend, lancamento_id: null,
          });
        }
        NF.ui.toast(`Lançado: pago ${NF.util.brl(pago)} · devendo ${NF.util.brl(Y)}`);
        cursoDashboard(NF.ui.clear(body), curso);
      },
    });
  }

  return { extras }; // sem público
})();

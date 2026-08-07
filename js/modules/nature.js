// modules/nature.js — NatureFace: extras financeiros (estoque, pedidos). Sem parte pública.
// Isolado: mexer aqui NÃO afeta Academy nem Clínica.
const NFn = window.NF || (window.NF = {});
NF.modules = NF.modules || {};

NF.modules.nature = (() => {
  const el = NF.ui.el;
  const NEG = 'naturefac';

  // ---- EXTRAS financeiros (só admin) ----
  const extras = [
    { id: 'estoque', label: 'Estoque', render: viewEstoque },
    { id: 'pedidos', label: 'Pedidos', render: viewPedidos },
  ];

  // Pedidos (Yampi entra automático via webhook + processador no banco).
  async function viewPedidos(body) {
    const pedidos = await NF.data.list('pedidos', { negocio: NEG });
    pedidos.sort((a, b) => (b.data_pedido || b.created_at || '').localeCompare(a.data_pedido || a.created_at || ''));
    const total = pedidos.reduce((s, p) => s + (p.valor_total || 0), 0);
    body.append(el('div', { class: 'nf-row-head' },
      el('h4', {}, 'Pedidos da loja (Yampi)'), el('span', {})));
    body.append(el('p', { class: 'nf-hint' }, `${pedidos.length} pedido(s) · total ${NF.util.brl(total)} — entram automático quando a compra é aprovada.`));
    body.append(NF.ui.table([
      { key: 'data_pedido', label: 'Data', fmt: (v, r) => NF.util.dataBR(v || r.created_at) },
      { key: 'cliente_nome', label: 'Cliente', fmt: v => v || '—' },
      { key: 'valor_total', label: 'Valor', fmt: v => NF.util.brl(v) },
      { key: 'status', label: 'Status', fmt: v => `<span class="nf-badge ${v === 'aprovado' ? 'recebido' : 'previsto'}">${v}</span>` },
    ], pedidos, (r) => [NF.ui.iconBtn('Itens', 'ghost', () => verItensPedido(r))]));
  }

  async function verItensPedido(pedido) {
    const itens = await NF.data.list('pedido_itens', { pedido_id: pedido.id });
    const linhas = itens.map(i => `${i.quantidade}× ${i.descricao || i.sku || 'item'} — ${NF.util.brl(i.valor_unit)}`).join('\n');
    NF.ui.modal({
      title: `Pedido de ${pedido.cliente_nome || 'cliente'}`,
      campos: [{ name: 'itens', label: `${itens.length} item(ns) · total ${NF.util.brl(pedido.valor_total)}`, type: 'textarea', value: linhas || '(sem itens)' }],
      submitLabel: 'Fechar',
      onSubmit: async () => {},
    });
  }

  async function viewEstoque(body) {
    const produtos = await NF.data.list('produtos', { negocio: NEG });
    body.append(el('div', { class: 'nf-row-head' },
      el('h4', {}, 'Estoque de produtos'),
      el('button', { class: 'btn', onclick: () => NF.ui.modal({
        title: 'Novo produto',
        campos: [
          { name: 'nome', label: 'Nome', required: true },
          { name: 'categoria', label: 'Categoria' },
          { name: 'custo', label: 'Custo', type: 'number', step: '0.01' },
          { name: 'preco_venda', label: 'Preço de venda', type: 'number', step: '0.01' },
          { name: 'quantidade', label: 'Quantidade', type: 'number', value: 0 },
          { name: 'estoque_minimo', label: 'Estoque mínimo', type: 'number', value: 0 },
        ],
        submitLabel: 'Cadastrar',
        onSubmit: async (d) => { await NF.data.insert('produtos', { negocio: NEG, ativo: true, ...d }); NF.ui.toast('Produto cadastrado'); viewEstoque(NF.ui.clear(body)); },
      }) }, '+ Novo produto')));

    const baixos = produtos.filter(p => p.quantidade <= p.estoque_minimo);
    if (baixos.length) body.append(el('div', { class: 'nf-alert' }, `⚠ ${baixos.length} produto(s) com estoque baixo (≤ mínimo).`));

    body.append(NF.ui.table([
      { key: 'nome', label: 'Produto' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'custo', label: 'Custo', fmt: v => NF.util.brl(v) },
      { key: 'preco_venda', label: 'Preço', fmt: v => NF.util.brl(v) },
      { key: 'quantidade', label: 'Qtd', fmt: (v, r) => v <= r.estoque_minimo ? `<span class="nf-badge atrasado">${v}</span>` : v },
      { key: 'estoque_minimo', label: 'Mín.' },
    ], produtos, (r) => [
      NF.ui.iconBtn('Entrada', '', () => movEstoque(r, 'entrada', body)),
      NF.ui.iconBtn('Saída', 'ghost', () => movEstoque(r, 'saida', body)),
      NF.ui.iconBtn('Excluir', 'danger', async () => { await NF.data.remove('produtos', r.id); NF.ui.toast('Excluído'); viewEstoque(NF.ui.clear(body)); }),
    ]));
  }

  function movEstoque(produto, tipo, body) {
    NF.ui.modal({
      title: `${tipo === 'entrada' ? 'Entrada' : 'Saída'} de estoque — ${produto.nome}`,
      campos: [{ name: 'quantidade', label: 'Quantidade', type: 'number', required: true }, { name: 'motivo', label: 'Motivo' }],
      submitLabel: 'Registrar',
      onSubmit: async (d) => {
        const delta = tipo === 'entrada' ? d.quantidade : -d.quantidade;
        await NF.data.update('produtos', produto.id, { quantidade: (produto.quantidade || 0) + delta });
        await NF.data.insert('estoque_mov', { negocio: NEG, produto_id: produto.id, tipo, quantidade: d.quantidade, motivo: d.motivo, data: NF.util.hoje() });
        NF.ui.toast('Movimentação registrada'); viewEstoque(NF.ui.clear(body));
      },
    });
  }

  return { extras }; // ferramenta interna: sem parte pública
})();

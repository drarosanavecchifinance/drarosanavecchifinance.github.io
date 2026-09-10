// dda.js — DDA: central de boletos (todas as empresas), com baixa manual.
// Cada boleto é uma despesa (categoria 'Boleto (DDA)') da empresa escolhida —
// por isso ele também aparece na aba Despesas da empresa correspondente.
const NFdda = window.NF || (window.NF = {});

NF.dda = (() => {
  const el = NF.ui.el;
  const CAT = 'Boleto (DDA)';

  async function render(mount) {
    const box = el('section', { class: 'nf-fin' });
    box.append(el('div', { class: 'nf-fin-head' }, el('h2', {}, 'DDA — Boletos')));
    const body = el('div', {});
    box.append(body);
    mount.append(box);
    await view(body);
  }

  async function view(body, filtroNeg) {
    NF.ui.clear(body);
    // Entram no DDA: boletos cadastrados aqui E qualquer despesa marcada como
    // boleto (categoria contendo "boleto") lançada na aba Despesas das empresas.
    const todos = (await NF.data.list('lancamentos'))
      .filter(l => l.tipo === 'despesa' && /boleto/i.test(l.categoria || ''));
    // Filtro por empresa: cartões e lista mostram só os boletos da escolhida.
    const boletos = filtroNeg ? todos.filter(b => b.negocio === filtroNeg) : todos;
    const hoje = NF.util.hoje();
    const nomeNeg = n => NF_CONFIG.NEGOCIOS[n]?.nome || n;
    const venc = d => d.vencimento || d.data;
    // O DDA é a fila do que está EM ABERTO: pagou, deu baixa e sai daqui
    // (o registro segue como despesa paga na aba Despesas da empresa).
    const abertos = boletos.filter(b => b.pago !== true);
    const aVencer = abertos.filter(b => venc(b) >= hoje);
    const vencidos = abertos.filter(b => venc(b) < hoje);
    const sum = a => a.reduce((s, b) => s + b.valor, 0);
    const reload = () => view(body, filtroNeg);

    body.append(el('div', { class: 'nf-scope', style: 'margin-bottom:14px;' },
      el('span', {}, 'Empresa:'),
      ...[{ id: null, nome: 'Todas' }, ...Object.values(NF_CONFIG.NEGOCIOS)].map(o =>
        el('button', { class: 'chip' + ((filtroNeg || null) === o.id ? ' active' : ''),
          onclick: () => view(body, o.id) }, o.nome))));

    const card = (lbl, arr, cls) => el('div', { class: `nf-mini ${cls}` },
      el('span', { class: 'lbl' }, lbl), el('strong', {}, NF.util.brl(sum(arr))),
      el('span', { class: 'nf-mini-sub' }, `${arr.length} boleto(s)`));
    body.append(el('div', { class: 'nf-mini-grid' },
      card('A vencer', aVencer, 'warn'),
      card('Vencidos', vencidos, 'neg')));
    if (vencidos.length) body.append(el('div', { class: 'nf-alert' },
      `⚠ ${vencidos.length} boleto(s) vencido(s) somando ${NF.util.brl(sum(vencidos))} em aberto.`));

    // Novo boleto (r = null) / Editar (r = boleto existente).
    function abrirForm(r) {
      const editando = !!r;
      NF.ui.modal({
        title: editando ? 'Editar boleto' : 'Novo boleto',
        campos: [
          { name: 'negocio', label: 'Empresa', type: 'select', value: r?.negocio || 'naturefac',
            options: Object.values(NF_CONFIG.NEGOCIOS).map(n => ({ value: n.id, label: n.nome })) },
          { name: 'descricao', label: 'Beneficiário / descrição', required: true, value: r?.descricao || '' },
          { name: 'valor', label: 'Valor', type: 'number', step: '0.01', required: true, value: r?.valor ?? '' },
          { name: 'vencimento', label: 'Vencimento', type: 'date', required: true, value: r ? venc(r) : hoje },
          { name: 'arquivo', label: 'Anexar o boleto (PDF/imagem, opcional)', type: 'file' },
          { name: 'comprovante_url', label: 'Ou link (Google Drive, opcional)', value: r?.comprovante_url || '' },
        ],
        submitLabel: editando ? 'Salvar' : 'Adicionar',
        onSubmit: async (d) => {
          let anexo = (d.comprovante_url || '').trim();
          if (d.arquivo) {
            const url = await NF.data.uploadComprovante(d.arquivo, d.negocio);
            if (url) anexo = url;
          }
          const anexoCampos = (anexo || (editando && r.comprovante_url)) ? { comprovante_url: anexo || null } : {};
          const campos = { negocio: d.negocio, descricao: d.descricao, valor: d.valor,
            categoria: editando ? r.categoria : CAT,
            vencimento: d.vencimento, data: d.vencimento, pago: false, data_pagamento: null, ...anexoCampos };
          if (editando) { await NF.data.update('lancamentos', r.id, campos); NF.ui.toast('Boleto atualizado'); }
          else { await NF.data.insert('lancamentos', { tipo: 'despesa', ...campos }); NF.ui.toast('Boleto adicionado'); }
          reload();
        },
      });
    }

    body.append(el('div', { class: 'nf-row-head' },
      el('h4', {}, 'Boletos'),
      el('button', { class: 'btn', onclick: () => abrirForm() }, '+ Novo boleto')));

    abertos.sort((a, b) => venc(a).localeCompare(venc(b)));   // vence primeiro em cima
    body.append(NF.ui.table([
      { key: 'vencimento', label: 'Vencimento', fmt: (_, r) => NF.util.dataBR(venc(r)) },
      { key: 'negocio', label: 'Empresa', fmt: v => nomeNeg(v) },
      { key: 'descricao', label: 'Beneficiário' },
      { key: 'valor', label: 'Valor', fmt: v => NF.util.brl(v) },
      { key: 'comprovante_url', label: 'Anexo', fmt: v => v ? `<a href="${v}" target="_blank" rel="noopener">📎 abrir</a>` : '—' },
      { key: 'status', label: 'Status', fmt: (_, r) =>
          venc(r) < hoje ? '<span class="nf-badge atrasado">vencido</span>'
                         : '<span class="nf-badge previsto">a vencer</span>' },
    ], abertos, (r) => [
      // Pagar = baixa: sai do DDA e fica como despesa paga na empresa.
      NF.ui.iconBtn('Pagar', '', async () => { await NF.data.update('lancamentos', r.id, { pago: true, data_pagamento: NF.util.hoje() }); NF.ui.toast('Boleto pago — baixado do DDA'); reload(); }),
      NF.ui.iconBtn('Editar', 'ghost', () => abrirForm(r)),
      NF.ui.iconBtn('Excluir', 'danger', async () => { await NF.data.remove('lancamentos', r.id); NF.ui.toast('Excluído'); reload(); }),
    ]));
  }

  return { render };
})();

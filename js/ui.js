// ui.js — helpers de interface compartilhados (layout-base).
const NFui = window.NF || (window.NF = {});

NF.ui = {
  el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) n.setAttribute(k, v);
    }
    children.flat().forEach(c => { if (c != null) n.append(c.nodeType ? c : document.createTextNode(c)); });
    return n;
  },

  clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; },

  toast(msg, tipo = 'ok') {
    let box = document.getElementById('nf-toasts');
    if (!box) { box = NF.ui.el('div', { id: 'nf-toasts' }); document.body.append(box); }
    const t = NF.ui.el('div', { class: `nf-toast ${tipo}` }, msg);
    box.append(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
  },

  // Modal com formulário. campos: [{name,label,type,required,options,value,step}]
  modal({ title, campos, onSubmit, submitLabel = 'Salvar' }) {
    const overlay = NF.ui.el('div', { class: 'nf-modal-overlay' });
    const form = NF.ui.el('form', { class: 'nf-modal' });
    form.append(NF.ui.el('h3', {}, title));

    const inputs = {};
    for (const c of campos) {
      const wrap = NF.ui.el('label', { class: 'nf-field' }, NF.ui.el('span', {}, c.label + (c.required ? ' *' : '')));
      let input;
      if (c.type === 'select') {
        input = NF.ui.el('select', { name: c.name });
        (c.options || []).forEach(o => input.append(NF.ui.el('option', { value: o.value }, o.label)));
        if (c.value != null) input.value = c.value;
      } else if (c.type === 'textarea') {
        input = NF.ui.el('textarea', { name: c.name, rows: 3 }); input.value = c.value || '';
      } else {
        input = NF.ui.el('input', { name: c.name, type: c.type || 'text' });
        if (c.step) input.step = c.step;
        if (c.value != null) input.value = c.value;
      }
      if (c.required) input.required = true;
      if (c.placeholder) input.placeholder = c.placeholder;
      if (typeof c.onChange === 'function') input.addEventListener('change', () => c.onChange(input.value, inputs));
      inputs[c.name] = input;
      wrap.append(input); form.append(wrap);
    }

    const actions = NF.ui.el('div', { class: 'nf-modal-actions' },
      NF.ui.el('button', { type: 'button', class: 'btn ghost', onclick: () => overlay.remove() }, 'Cancelar'),
      NF.ui.el('button', { type: 'submit', class: 'btn' }, submitLabel),
    );
    form.append(actions);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {};
      for (const [k, inp] of Object.entries(inputs)) {
        data[k] = inp.type === 'number' ? (inp.value === '' ? null : Number(inp.value)) : inp.value;
      }
      await onSubmit(data);
      overlay.remove();
    });
    overlay.append(form);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.append(overlay);
    return overlay;
  },

  async confirm(msg) { return window.confirm(msg); },

  // Busca CEP na ViaCEP e preenche inputs.endereco/cidade/estado (se existirem).
  async buscaCep(cep, inputs) {
    const c = (cep || '').replace(/\D/g, '');
    if (c.length !== 8) return;
    try {
      const j = await (await fetch(`https://viacep.com.br/ws/${c}/json/`)).json();
      if (j.erro) { NF.ui.toast('CEP não encontrado', 'err'); return; }
      if (inputs.endereco) inputs.endereco.value = j.logradouro || '';
      if (inputs.cidade) inputs.cidade.value = j.localidade || '';
      if (inputs.estado) inputs.estado.value = j.uf || '';
    } catch { NF.ui.toast('Não consegui buscar o CEP', 'err'); }
  },

  // Tabela simples. cols: [{key,label,fmt}]  rows: array  actions: fn(row)->[buttons]
  table(cols, rows, actions) {
    const t = NF.ui.el('table', { class: 'nf-table' });
    const thead = NF.ui.el('tr', {});
    cols.forEach(c => thead.append(NF.ui.el('th', {}, c.label)));
    if (actions) thead.append(NF.ui.el('th', { class: 'right' }, ''));
    t.append(NF.ui.el('thead', {}, thead));
    const tb = NF.ui.el('tbody', {});
    if (!rows.length) {
      tb.append(NF.ui.el('tr', {}, NF.ui.el('td', { colspan: cols.length + (actions ? 1 : 0), class: 'empty' }, 'Nada por aqui ainda.')));
    }
    rows.forEach(r => {
      const tr = NF.ui.el('tr', {});
      cols.forEach(c => {
        const val = c.fmt ? c.fmt(r[c.key], r) : (r[c.key] ?? '');
        const td = NF.ui.el('td', {});
        if (val && val.nodeType) td.append(val); else td.innerHTML = val;
        tr.append(td);
      });
      if (actions) {
        const td = NF.ui.el('td', { class: 'right actions' });
        (actions(r) || []).forEach(b => td.append(b));
        tr.append(td);
      }
      tb.append(tr);
    });
    t.append(tb);
    return t;
  },

  iconBtn(label, cls, onclick) {
    return NF.ui.el('button', { class: `btn tiny ${cls || ''}`, onclick }, label);
  },
};

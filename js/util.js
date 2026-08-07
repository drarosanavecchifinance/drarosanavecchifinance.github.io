// util.js — helpers gerais + MOTOR FINANCEIRO (parcelas, taxa, competência x caixa)
// -----------------------------------------------------------------------------
// Regras do PROMPT (seção 5.1):
//  - Faturamento/Vendas = valor BRUTO, na competência (mês de data_venda).
//  - Carteira/recebimento = valor LÍQUIDO (desconta a taxa da forma de pagamento).
//  - Cartão: N parcelas iguais, uma a cada ~31 dias, a 1ª ~31 dias após a venda.
//  - PIX/dinheiro: 1 parcela imediata (cai no mês da venda).
//  - Boleto/a_prazo: 1 parcela na data combinada.
// -----------------------------------------------------------------------------

const NF = window.NF || (window.NF = {});

NF.util = {
  // ---- dinheiro ----
  brl(v) {
    return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },
  round2(v) { return Math.round((v + Number.EPSILON) * 100) / 100; },

  // ---- datas ----
  // Data LOCAL (não UTC) — em UTC-3 o toISOString() vira o dia seguinte à noite,
  // o que jogaria a venda pra outro mês de competência. Usamos o calendário local.
  hoje() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  addDias(iso, dias) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  },
  mesDe(iso) { return (iso || '').slice(0, 7); },            // 'YYYY-MM'
  mesLabel(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${nomes[+m - 1]}/${y.slice(2)}`;
  },
  dataBR(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  },
  uid() { return 'id_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); },

  // Tabela de taxas do negócio: TAXAS_POR_NEGOCIO sobrepõe a geral, campo a campo.
  taxasDe(negocio) {
    const esp = (NF_CONFIG.TAXAS_POR_NEGOCIO || {})[negocio];
    return esp ? { ...NF_CONFIG.TAXAS, ...esp } : NF_CONFIG.TAXAS;
  },
  // Taxa do crédito ESCALONADA pelo nº de parcelas (config NF_CONFIG.TAXAS).
  taxaCredito(parcelas, negocio) {
    const T = NF.util.taxasDe(negocio); const n = parcelas || 1;
    if (n <= 1) return T.credito_avista;
    for (const f of T.credito) if (n <= f.ate) return f.taxa;
    return T.credito[T.credito.length - 1].taxa;
  },
  // Taxa efetiva de uma forma (cartão = escalonado; débito/crédito pelo nome; resto = taxa da forma).
  taxaEfetiva(forma, parcelas, negocio) {
    if (!forma) return 0;
    const T = NF.util.taxasDe(negocio);
    if (forma.tipo === 'pix') return T.pix ?? (forma.taxa_pct || 0);
    if (forma.tipo === 'cartao') {
      const nome = (forma.nome || '').toLowerCase();
      if (nome.includes('déb') || nome.includes('deb')) return T.debito;
      return NF.util.taxaCredito(parcelas, negocio);
    }
    return forma.taxa_pct || 0;
  },

  // ---- MOTOR: gera o cronograma de parcelas de uma venda ----
  // venda: { valor_bruto, data_venda, num_parcelas, forma } ; forma: {tipo, nome}
  // Retorna array de parcelas { parcela_num, total_parcelas, valor_parcela_bruto,
  //   valor_parcela_liquido, data_prevista, status }
  gerarParcelas(valor_bruto, data_venda, num_parcelas, forma, negocio) {
    const tipo = forma?.tipo || 'pix';
    let n = Math.max(1, num_parcelas || 1);

    // Formas de recebimento imediato = 1 parcela no dia da venda.
    if (tipo === 'pix' || tipo === 'dinheiro') n = 1;

    const taxa = NF.util.taxaEfetiva(forma, n, negocio) / 100;   // escalonada pelo nº de parcelas

    const parcelas = [];
    const bruto = NF.util.round2(valor_bruto / n);
    let somaBruto = 0, somaLiq = 0;

    for (let i = 1; i <= n; i++) {
      const ultima = i === n;
      // Ajusta a última parcela com o centavo residual do arredondamento.
      const vb = ultima ? NF.util.round2(valor_bruto - somaBruto) : bruto;
      const vl = ultima
        ? NF.util.round2(valor_bruto * (1 - taxa) - somaLiq)
        : NF.util.round2(vb * (1 - taxa));
      somaBruto += vb; somaLiq += vl;

      let data_prevista;
      if (tipo === 'pix' || tipo === 'dinheiro') {
        data_prevista = data_venda;                              // cai no mês da venda
      } else if (tipo === 'cartao') {
        data_prevista = NF.util.addDias(data_venda, i * NF_CONFIG.DIAS_ENTRE_PARCELAS); // 1ª ~31d depois
      } else { // boleto / a_prazo — 1 parcela ~31 dias por padrão (data pode ser editada depois)
        data_prevista = NF.util.addDias(data_venda, NF_CONFIG.DIAS_ENTRE_PARCELAS);
      }

      parcelas.push({
        parcela_num: i, total_parcelas: n,
        valor_parcela_bruto: vb, valor_parcela_liquido: vl,
        data_prevista, status: 'previsto',
      });
    }
    return parcelas;
  },

  // Marca parcelas vencidas e não recebidas como 'atrasado' (não persiste; visual).
  statusParcela(p) {
    if (p.status === 'recebido') return 'recebido';
    if (p.data_prevista < NF.util.hoje()) return 'atrasado';
    return 'previsto';
  },
};

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, Header, Footer,
  PageNumber, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  TabStopType,
} = require('docx');

const DIR = __dirname;
const OUT = process.argv[2] || DIR;
const LOGO = fs.readFileSync(path.join(DIR, 'logo.png'));
const NAVY = '041E3A';
const FONT = 'Calibri';
const W = 9638; // largura útil A4 com margens de 1134 (2 cm)

// ---------- helpers ----------
// Campo a preencher: destacado em amarelo para ser fácil de localizar no Word.
const F = (t) => new TextRun({ text: t, highlight: 'yellow', font: FONT });
const T = (t, o = {}) => new TextRun({ text: t, font: FONT, ...o });
const B = (t) => T(t, { bold: true });
const val = (v, placeholder) => (v ? B(v) : F(placeholder));

const p = (runs, o = {}) => new Paragraph({
  children: Array.isArray(runs) ? runs : [T(runs)],
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 80, line: 276 },
  ...o,
});
const clause = (n, title) => new Paragraph({
  children: [T(`CLÁUSULA ${n} – ${title}`, { bold: true, color: NAVY, size: 22 })],
  spacing: { before: 180, after: 80 },
  keepNext: true,
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'B8C4D2', space: 2 } },
});
const item = (num, runs) => p([B(`${num} `), ...(Array.isArray(runs) ? runs : [T(runs)])]);

const border = { style: BorderStyle.SINGLE, size: 4, color: 'B8C4D2' };
const borders = { top: border, bottom: border, left: border, right: border };
const cell = (runs, width, o = {}) => new TableCell({
  borders, width: { size: width, type: WidthType.DXA },
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  shading: o.head ? { fill: NAVY, type: ShadingType.CLEAR, color: 'auto' }
    : o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
  children: [new Paragraph({
    keepNext: true, keepLines: true,
    alignment: o.align || AlignmentType.LEFT,
    children: (Array.isArray(runs) ? runs : [T(runs, o.head ? { bold: true, color: 'FFFFFF' } : {})]),
  })],
});
const table = (widths, rows) => new Table({
  width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  columnWidths: widths,
  rows: rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => (c instanceof TableCell ? c : cell(c, widths[i]))) })),
});

// AppChurch é conduzido como pessoa física (CPF) — sem CNPJ/razão social.
const qualifPF = () => p([
  B('CONTRATADA: '), F('[Nome completo]'), T(', inscrito(a) no CPF sob o nº '), F('[000.000.000-00]'),
  T(', residente em '), F('[endereço, cidade/UF]'), T(', e-mail '), F('[e-mail]'), T(', telefone '), F('[(00) 00000-0000]'),
  T(', responsável pela plataforma AppChurch, doravante denominado(a) '), B('APPCHURCH'), T('.'),
]);
const qualifPJ = (c) => p([
  B('CONTRATANTE: '), val(c.nome, '[Nome da igreja]'), T(', inscrita no CNPJ sob o nº '), val(c.cnpj, '[00.000.000/0000-00]'),
  T(', com sede em '), val(c.endereco, '[endereço, cidade/UF]'), T(', representada por '), val(c.rep, '[nome do representante]'),
  T(', CPF nº '), val(c.cpf, '[000.000.000-00]'), T(', doravante denominada '), B('IGREJA'), T('.'),
]);

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
const sigCell = (lines) => new TableCell({
  width: { size: W / 2, type: WidthType.DXA }, borders: noBorders,
  children: lines.map((l, i) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: i === 0 ? { before: 560 } : {}, children: Array.isArray(l) ? l : [T(l, { size: 20 })] })),
});
const sigRow = (a, b) => new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W / 2, W / 2], rows: [new TableRow({ cantSplit: true, children: [sigCell(a), sigCell(b)] })] });

function build(d) {
  const c = d.contratante;
  const pg = d.pagamento;
  const out = [];

  out.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 240 },
    children: [T('CONTRATO DE LICENÇA DE USO – PLATAFORMA APPCHURCH', { bold: true, size: 28, color: NAVY })],
  }));
  out.push(qualifPF());
  out.push(qualifPJ(c));
  out.push(p('As partes celebram o presente contrato, que se regerá pelas cláusulas a seguir.'));

  out.push(clause('1ª', 'OBJETO'));
  out.push(item('1.1.', [T('Licença de uso, não exclusiva e intransferível, da plataforma online '), B('AppChurch'), T(' (software como serviço), destinada à gestão eclesiástica da IGREJA, compreendendo: (a) cadastro e gestão de membros, visitantes e líderes; (b) gestão de células, unidades/congregações e discipulado; (c) relatórios e indicadores de crescimento; (d) notificações e comunicação com os membros; e (e) suporte técnico e atualizações.')]));
  out.push(item('1.2.', 'A licença não transfere propriedade intelectual. O software, seu código, a marca e o layout permanecem de titularidade exclusiva da APPCHURCH.'));
  out.push(item('1.3.', 'A APPCHURCH poderá incluir ou aprimorar funcionalidades a qualquer tempo, sem prejuízo das funcionalidades essenciais contratadas.'));

  out.push(clause('2ª', 'VALOR E PAGAMENTO'));
  const row = (k, v) => [cell([B(k)], 3000, { fill: 'EEF2F7' }), cell(v, 6638)];
  out.push(table([3000, 6638], [
    row('Plano', [val(pg.plano, '[Plano Mensal]')]),
    row('Valor mensal', [val(pg.valor, '[R$ 0,00 (valor por extenso)]')]),
    row('Vencimento', [T('Todo dia '), val(pg.dia, '[__]'), T(' de cada mês, via '), val(pg.forma, '[PIX / boleto]')]),
    row('Início da vigência', [val(pg.inicio, '[__/__/____]')]),
  ]));
  out.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
  out.push(item('2.1.', 'O primeiro pagamento vence no primeiro vencimento após o início da vigência, e os demais nos meses subsequentes, enquanto vigorar este contrato.'));
  out.push(item('2.2.', 'O valor será reajustado a cada 12 (doze) meses, contados do início da vigência, pela variação do IPCA/IBGE ou índice que o substitua, salvo disposição diversa nas Condições Especiais.'));
  out.push(item('2.3.', 'O atraso sujeita a IGREJA a multa de 2% (dois por cento) sobre o valor devido e juros de mora de 1% (um por cento) ao mês, pro rata die.'));
  out.push(item('2.4.', 'Após 15 (quinze) dias de atraso, a APPCHURCH poderá, mediante aviso por e-mail ou WhatsApp, suspender o acesso à plataforma até a regularização, sem perda dos dados da IGREJA.'));

  out.push(clause('3ª', 'CONDIÇÕES ESPECIAIS'));
  const ce = d.condicoesEspeciais;
  const box = [];
  if (ce && ce.length) {
    ce.forEach((x, i) => box.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED, spacing: { after: 80, line: 270 },
      children: [B(`3.${i + 1}. `), ...(Array.isArray(x) ? x : [T(x)])],
    })));
  } else {
    box.push(new Paragraph({ spacing: { after: 80 }, children: [F('[Descreva as condições especiais negociadas. Caso não haja, escreva: "Não há condições especiais."]')] }));
    for (let i = 0; i < 3; i++) box.push(new Paragraph({ spacing: { before: 200 }, children: [T('_'.repeat(78), { color: '999999' })] }));
  }
  out.push(new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [W],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: W, type: WidthType.DXA },
      borders: { top: { style: BorderStyle.SINGLE, size: 4, color: NAVY }, bottom: { style: BorderStyle.SINGLE, size: 4, color: NAVY }, right: { style: BorderStyle.SINGLE, size: 4, color: NAVY }, left: { style: BorderStyle.SINGLE, size: 24, color: NAVY } },
      shading: { fill: 'F4F7FB', type: ShadingType.CLEAR, color: 'auto' },
      margins: { top: 120, bottom: 120, left: 200, right: 200 },
      children: box,
    })] })],
  }));
  if (d.anexo) {
    out.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
    const rows = [[cell('Igreja', 3800, { head: true }), cell('CNPJ', 2900, { head: true }), cell('Valor mensal', 2938, { head: true, align: AlignmentType.RIGHT })]];
    d.anexo.forEach((r) => rows.push([
      cell([r.nome ? T(r.nome, { bold: !!r.sede }) : F(r.ph)], 3800),
      cell([r.cnpj ? T(r.cnpj) : F('[00.000.000/0000-00]')], 2900),
      cell([T(r.valor)], 2938, { align: AlignmentType.RIGHT }),
    ]));
    rows.push([cell([B('Total mensal')], 3800, { fill: 'EEF2F7' }), cell('', 2900, { fill: 'EEF2F7' }), cell([B(d.anexoTotal)], 2938, { fill: 'EEF2F7', align: AlignmentType.RIGHT })]);
    out.push(table([3800, 2900, 2938], rows));
  }

  out.push(clause('4ª', 'OBRIGAÇÕES DA APPCHURCH'));
  out.push(item('4.1.', 'Manter a plataforma disponível 24 (vinte e quatro) horas por dia, ressalvadas manutenções programadas, falhas de terceiros (internet, hospedagem, energia) e casos fortuitos ou de força maior.'));
  out.push(item('4.2.', 'Prestar suporte técnico por WhatsApp e/ou e-mail, em dias úteis e horário comercial, e realizar backups periódicos dos dados.'));
  out.push(item('4.3.', 'Manter sigilo sobre os dados da IGREJA e comunicar com 30 (trinta) dias de antecedência qualquer alteração de valores não prevista neste contrato.'));

  out.push(clause('5ª', 'OBRIGAÇÕES DA IGREJA'));
  out.push(item('5.1.', 'Efetuar pontualmente os pagamentos e manter seus dados cadastrais atualizados, inclusive o número de células, quando for critério de preço.'));
  out.push(item('5.2.', 'Manter sob sigilo logins e senhas, respondendo pelo uso da plataforma por seus usuários.'));
  out.push(item('5.3.', 'Não copiar, revender, sublicenciar, modificar ou realizar engenharia reversa do software.'));

  out.push(clause('6ª', 'PROTEÇÃO DE DADOS (LGPD)'));
  out.push(item('6.1.', 'Nos termos da Lei nº 13.709/2018, a IGREJA é controladora e a APPCHURCH operadora dos dados pessoais de membros, visitantes e líderes, tratando-os apenas para a execução deste contrato e conforme as instruções da IGREJA, que se responsabiliza pela licitude da coleta.'));
  out.push(item('6.2.', 'A APPCHURCH adotará medidas de segurança adequadas e comunicará à IGREJA qualquer incidente de segurança relevante.'));
  out.push(item('6.3.', 'Encerrado o contrato, a IGREJA poderá solicitar a exportação de seus dados em até 30 (trinta) dias; após esse prazo, os dados poderão ser excluídos definitivamente.'));

  out.push(clause('7ª', 'VIGÊNCIA E RESCISÃO'));
  out.push(item('7.1.', 'Este contrato vigora por prazo indeterminado a partir do início da vigência.'));
  out.push(item('7.2.', 'Qualquer das partes poderá rescindi-lo, sem multa, com aviso prévio por escrito de 30 (trinta) dias, sendo devidas as mensalidades até o fim do aviso.'));
  out.push(item('7.3.', 'O contrato poderá ser rescindido de imediato em caso de descumprimento de cláusula não sanado em 10 (dez) dias após notificação, ou de inadimplência superior a 60 (sessenta) dias.'));

  out.push(clause('8ª', 'DISPOSIÇÕES GERAIS E FORO'));
  out.push(item('8.1.', 'A responsabilidade da APPCHURCH por eventuais danos fica limitada ao valor pago pela IGREJA nos 12 (doze) meses anteriores ao fato.'));
  out.push(item('8.2.', 'A tolerância quanto ao descumprimento de qualquer obrigação não implica renúncia de direitos. As comunicações por e-mail ou WhatsApp, nos contatos deste contrato, são válidas.'));
  out.push(item('8.3.', 'As partes reconhecem a validade da assinatura eletrônica deste contrato (Lei nº 14.063/2020).'));
  out.push(item('8.4.', [T('Fica eleito o foro da Comarca de '), val(d.foro, '[Cidade/UF]'), T(' para dirimir quaisquer questões oriundas deste contrato.')]));

  out.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 200 }, keepNext: true, children: [val(d.local, '[Cidade/UF]'), T(', '), F('[dia]'), T(' de '), F('[mês]'), T(' de '), F('[ano]'), T('.')] }));

  out.push(sigRow(
    ['______________________________', [F('[Nome completo]')], 'APPCHURCH'],
    ['______________________________', [c.nome ? B(c.nome) : F('[Nome da igreja]')], 'IGREJA'],
  ));
  out.push(sigRow(
    ['______________________________', 'Testemunha 1 – Nome/CPF'],
    ['______________________________', 'Testemunha 2 – Nome/CPF'],
  ));

  return new Document({
    creator: 'AppChurch',
    title: 'Contrato AppChurch',
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1600, bottom: 1000, left: 1134, right: 1134, header: 500 } } },
      headers: { default: new Header({ children: [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: W }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 6 } },
        children: [
          new ImageRun({ type: 'png', data: LOGO, transformation: { width: 96, height: 38 } }),
          T('\tContrato de Licença de Uso – Plataforma AppChurch', { size: 18, color: '555555' }),
        ],
      })] }) },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [T('Página ', { size: 18, color: '777777' }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '777777', font: FONT }), T(' de ', { size: 18, color: '777777' }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '777777', font: FONT })],
      })] }) },
      children: out,
    }],
  });
}

// ---------- 1) Modelo padrão ----------
const modelo = { contratante: {}, pagamento: { plano: 'Plano Mensal' } };

// ---------- 2) Paz Church Sobral ----------
const paz = {
  contratante: { nome: 'Paz Church Sobral' },
  pagamento: { plano: 'Plano Mensal', valor: 'R$ 400,00 no total (sede + 4 igrejas da cobertura), conforme Cláusula 3ª' },
  local: 'Sobral/CE',
  foro: 'Sobral/CE',
  condicoesEspeciais: [
    [T('A Paz Church Sobral (sede) pagará '), B('R$ 200,00 (duzentos reais)'), T(' mensais.')],
    [T('Cada uma das '), B('4 (quatro) igrejas sob sua cobertura'), T(', listadas abaixo, pagará '), B('R$ 50,00 (cinquenta reais)'), T(' mensais, totalizando '), B('R$ 400,00'), T(' por mês para o conjunto.')],
    [T('O valor de R$ 50,00 por igreja poderá ser alterado quando a respectiva igreja '), B('passar de 15 (quinze) células'), T(', mediante aviso prévio de 30 (trinta) dias, sem alterar o valor das demais.')],
    'A Paz Church Sobral é responsável pelo pagamento do valor total, salvo se ajustado por escrito que cada igreja da cobertura pagará diretamente à APPCHURCH.',
    'Novas igrejas da cobertura poderão ser incluídas por aditivo ou troca de e-mails, nas mesmas condições desta cláusula.',
  ],
  anexo: [
    { nome: 'Paz Church Sobral (sede)', sede: true, valor: 'R$ 200,00' },
    { ph: '[Igreja da cobertura 1]', valor: 'R$ 50,00' },
    { ph: '[Igreja da cobertura 2]', valor: 'R$ 50,00' },
    { ph: '[Igreja da cobertura 3]', valor: 'R$ 50,00' },
    { ph: '[Igreja da cobertura 4]', valor: 'R$ 50,00' },
  ],
  anexoTotal: 'R$ 400,00',
};

(async () => {
  fs.writeFileSync(path.join(OUT, 'Contrato_AppChurch_Modelo.docx'), await Packer.toBuffer(build(modelo)));
  fs.writeFileSync(path.join(OUT, 'Contrato_AppChurch_Paz_Church_Sobral.docx'), await Packer.toBuffer(build(paz)));
  console.log('ok');
})();

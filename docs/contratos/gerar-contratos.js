const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, Header, Footer,
  PageNumber, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  LevelFormat, TabStopType,
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
  spacing: { after: 120, line: 300 },
  ...o,
});
const clause = (n, title) => new Paragraph({
  children: [T(`CLÁUSULA ${n} – ${title}`, { bold: true, color: NAVY, size: 23 })],
  spacing: { before: 280, after: 120 },
  keepNext: true,
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'B8C4D2', space: 2 } },
});
const item = (num, runs) => p([B(`${num} `), ...(Array.isArray(runs) ? runs : [T(runs)])]);
const bullet = (runs) => new Paragraph({
  children: Array.isArray(runs) ? runs : [T(runs)],
  numbering: { reference: 'bul', level: 0 },
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 60, line: 280 },
});

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

const qualif = (label, d, ph) => p([
  B(`${label}: `),
  val(d.nome, `[${ph.nome}]`), T(', pessoa jurídica de direito privado, inscrita no CNPJ sob o nº '),
  val(d.cnpj, '[00.000.000/0000-00]'), T(', com sede em '),
  val(d.endereco, '[endereço completo, cidade/UF, CEP]'), T(', neste ato representada por '),
  val(d.rep, '[nome do representante legal]'), T(', inscrito(a) no CPF sob o nº '),
  val(d.cpf, '[000.000.000-00]'), T(', e-mail '), val(d.email, '[e-mail]'), T(', telefone '),
  val(d.tel, '[(00) 00000-0000]'), T('.'),
]);

const signature = (label, name) => [
  new Paragraph({ spacing: { before: 600 }, children: [] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [T('_____________________________________________')] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [name ? B(name) : F('[Nome / Razão social]')] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [T(label, { size: 20, color: '555555' })] }),
];

// ---------- documento ----------
function build(d) {
  const c = d.contratante;
  const out = [];

  out.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 60 },
    children: [T('CONTRATO DE LICENÇA DE USO DE SOFTWARE', { bold: true, size: 30, color: NAVY })],
  }));
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 320 },
    children: [T('E PRESTAÇÃO DE SERVIÇOS – PLATAFORMA APPCHURCH', { bold: true, size: 24, color: NAVY })],
  }));
  out.push(p([T('Contrato nº '), val(d.numero, '[000/2026]')], { alignment: AlignmentType.RIGHT }));

  out.push(p([T('Pelo presente instrumento particular, as partes abaixo qualificadas:')]));
  out.push(qualif('CONTRATADA', d.contratada, { nome: 'Razão social da AppChurch' }));
  out.push(p([T('doravante denominada simplesmente '), B('APPCHURCH'), T(';')]));
  out.push(qualif('CONTRATANTE', c, { nome: 'Nome / razão social da igreja' }));
  out.push(p([T('doravante denominada simplesmente '), B('IGREJA'), T(';')]));
  out.push(p('têm entre si, justo e contratado, o presente Contrato de Licença de Uso de Software e Prestação de Serviços, que se regerá pelas cláusulas e condições a seguir.'));

  out.push(clause('1ª', 'DO OBJETO'));
  out.push(item('1.1.', [T('O presente contrato tem por objeto a concessão, pela APPCHURCH à IGREJA, de licença de uso, não exclusiva e intransferível, da plataforma '), B('AppChurch'), T(' (software como serviço – SaaS), acessível via internet, destinada à gestão eclesiástica, incluindo, entre outras funcionalidades disponíveis no plano contratado:')]));
  ['Cadastro e gestão de membros, visitantes e líderes;', 'Gestão de células, unidades/congregações e discipulado;', 'Relatórios, indicadores e acompanhamento de crescimento;', 'Envio de notificações e comunicação com os membros;', 'Suporte técnico e atualizações da plataforma.']
    .forEach((t) => out.push(bullet(t)));
  out.push(item('1.2.', 'A licença não implica cessão ou transferência de propriedade intelectual. O software, seu código-fonte, marca, layout e demais elementos permanecem de titularidade exclusiva da APPCHURCH.'));
  out.push(item('1.3.', 'A APPCHURCH poderá incluir, alterar ou aprimorar funcionalidades da plataforma a qualquer tempo, sem prejuízo das funcionalidades essenciais contratadas.'));

  out.push(clause('2ª', 'DO PLANO, DO VALOR E DO PAGAMENTO'));
  out.push(p([B('2.1. '), T('A IGREJA contrata o plano descrito abaixo:')], { keepNext: true }));
  const pg = d.pagamento;
  out.push(table([3600, 6038], [
    [cell('Item', 3600, { head: true }), cell('Condição', 6038, { head: true })],
    [cell([B('Plano')], 3600, { fill: 'EEF2F7' }), cell([val(pg.plano, '[Plano Mensal]')], 6038)],
    [cell([B('Valor mensal')], 3600, { fill: 'EEF2F7' }), cell([val(pg.valor, '[R$ 0,00 (valor por extenso)]')], 6038)],
    [cell([B('Vencimento')], 3600, { fill: 'EEF2F7' }), cell([T('Todo dia '), val(pg.dia, '[__]'), T(' de cada mês')], 6038)],
    [cell([B('Forma de pagamento')], 3600, { fill: 'EEF2F7' }), cell([val(pg.forma, '[PIX / boleto bancário / cartão]')], 6038)],
    [cell([B('Início da vigência')], 3600, { fill: 'EEF2F7' }), cell([val(pg.inicio, '[__/__/____]')], 6038)],
  ]));
  out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  out.push(item('2.2.', 'O primeiro pagamento será devido no primeiro vencimento após o início da vigência, e os demais sucessivamente nos meses subsequentes, enquanto vigorar este contrato.'));
  out.push(item('2.3.', 'O valor mensal será reajustado anualmente, a cada 12 (doze) meses contados do início da vigência, pela variação positiva do IPCA/IBGE acumulada no período, ou por outro índice que venha a substituí-lo, salvo disposição diversa nas Condições Especiais.'));
  out.push(item('2.4.', 'O atraso no pagamento sujeitará a IGREJA a multa de 2% (dois por cento) sobre o valor devido, acrescida de juros de mora de 1% (um por cento) ao mês, calculados pro rata die.'));
  out.push(item('2.5.', 'Persistindo o atraso por mais de 15 (quinze) dias após o vencimento, a APPCHURCH poderá, mediante aviso prévio por e-mail ou WhatsApp, suspender o acesso à plataforma até a regularização, sem que isso implique a perda dos dados da IGREJA.'));

  out.push(clause('3ª', 'DAS CONDIÇÕES ESPECIAIS'));
  out.push(item('3.1.', 'As partes ajustam as condições especiais abaixo, que prevalecem sobre as demais cláusulas deste contrato naquilo em que forem conflitantes:'));
  const ce = d.condicoesEspeciais;
  const box = [];
  if (ce && ce.length) {
    ce.forEach((x, i) => box.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED, spacing: { after: 100, line: 280 },
      children: [B(`3.1.${i + 1}. `), ...(Array.isArray(x) ? x : [T(x)])],
    })));
  } else {
    box.push(new Paragraph({ spacing: { after: 100 }, children: [F('[Descreva aqui as condições especiais negociadas – ex.: descontos, valores diferenciados por igreja/cobertura, carência, limites de células. Caso não haja, escreva: "Não há condições especiais."]')] }));
    for (let i = 0; i < 4; i++) box.push(new Paragraph({ spacing: { before: 200 }, children: [T('_'.repeat(78), { color: '999999' })] }));
  }
  out.push(new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [W],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: W, type: WidthType.DXA },
      borders: { top: { style: BorderStyle.SINGLE, size: 4, color: NAVY }, bottom: { style: BorderStyle.SINGLE, size: 4, color: NAVY }, right: { style: BorderStyle.SINGLE, size: 4, color: NAVY }, left: { style: BorderStyle.SINGLE, size: 24, color: NAVY } },
      shading: { fill: 'F4F7FB', type: ShadingType.CLEAR, color: 'auto' },
      margins: { top: 160, bottom: 160, left: 220, right: 220 },
      children: box,
    })] })],
  }));
  if (d.anexo) {
    out.push(new Paragraph({ keepNext: true, spacing: { before: 160, after: 120 }, children: [T('Tabela de igrejas abrangidas por este contrato:', { bold: true })] }));
    const rows = [[cell('Igreja', 3800, { head: true }), cell('CNPJ', 2600, { head: true }), cell('Valor mensal', 3238, { head: true, align: AlignmentType.RIGHT })]];
    d.anexo.forEach((r) => rows.push([
      cell([r.nome ? T(r.nome, { bold: !!r.sede }) : F(r.ph)], 3800),
      cell([r.cnpj ? T(r.cnpj) : F('[00.000.000/0000-00]')], 2600),
      cell([T(r.valor)], 3238, { align: AlignmentType.RIGHT }),
    ]));
    rows.push([cell([B('Total mensal')], 3800, { fill: 'EEF2F7' }), cell('', 2600, { fill: 'EEF2F7' }), cell([B(d.anexoTotal)], 3238, { fill: 'EEF2F7', align: AlignmentType.RIGHT })]);
    out.push(table([3800, 2600, 3238], rows));
  }

  out.push(clause('4ª', 'DAS OBRIGAÇÕES DA APPCHURCH'));
  ['Disponibilizar a plataforma em funcionamento, envidando os melhores esforços para mantê-la disponível 24 (vinte e quatro) horas por dia, ressalvadas manutenções programadas, falhas de terceiros (provedores de internet, hospedagem, energia) e casos fortuitos ou de força maior;',
    'Prestar suporte técnico à IGREJA pelos canais oficiais (WhatsApp e/ou e-mail), em dias úteis e horário comercial;',
    'Realizar cópias de segurança (backup) periódicas dos dados armazenados na plataforma;',
    'Manter sigilo sobre os dados e informações da IGREJA, utilizando-os exclusivamente para a execução deste contrato;',
    'Comunicar com antecedência mínima de 30 (trinta) dias qualquer alteração de valores não prevista neste contrato.']
    .forEach((t, i) => out.push(item(`4.${i + 1}.`, t)));

  out.push(clause('5ª', 'DAS OBRIGAÇÕES DA IGREJA'));
  ['Efetuar pontualmente os pagamentos na forma da Cláusula 2ª;',
    'Manter sob sigilo os logins e senhas de acesso, responsabilizando-se pelo uso da plataforma por seus usuários;',
    'Inserir na plataforma apenas dados obtidos de forma lícita, com base legal adequada nos termos da Lei nº 13.709/2018 (LGPD);',
    'Não copiar, revender, sublicenciar, modificar ou realizar engenharia reversa do software;',
    'Manter seus dados cadastrais atualizados junto à APPCHURCH, inclusive quanto ao número de células, quando for critério de precificação.']
    .forEach((t, i) => out.push(item(`5.${i + 1}.`, t)));

  out.push(clause('6ª', 'DA PROTEÇÃO DE DADOS (LGPD)'));
  out.push(item('6.1.', 'Para os fins da Lei nº 13.709/2018, a IGREJA atua como controladora dos dados pessoais de seus membros, visitantes e líderes, e a APPCHURCH como operadora, tratando-os exclusivamente conforme as instruções da IGREJA e para a finalidade deste contrato.'));
  out.push(item('6.2.', 'A APPCHURCH adotará medidas técnicas e administrativas aptas a proteger os dados pessoais contra acessos não autorizados e situações acidentais ou ilícitas, comunicando à IGREJA, em prazo razoável, qualquer incidente de segurança relevante.'));
  out.push(item('6.3.', 'Encerrado o contrato, a APPCHURCH disponibilizará à IGREJA, mediante solicitação feita em até 30 (trinta) dias, a exportação de seus dados, podendo após esse prazo excluí-los definitivamente, ressalvadas as hipóteses legais de guarda.'));

  out.push(clause('7ª', 'DA VIGÊNCIA E DA RESCISÃO'));
  out.push(item('7.1.', 'Este contrato vigora por prazo indeterminado a partir da data de início indicada na Cláusula 2ª.'));
  out.push(item('7.2.', 'Qualquer das partes poderá rescindi-lo, sem multa, mediante aviso prévio por escrito com antecedência mínima de 30 (trinta) dias, sendo devidas as mensalidades até o término do aviso.'));
  out.push(item('7.3.', 'O contrato poderá ser rescindido de imediato em caso de descumprimento de qualquer cláusula, não sanado em até 10 (dez) dias após notificação, ou de inadimplência superior a 60 (sessenta) dias.'));

  out.push(clause('8ª', 'DAS DISPOSIÇÕES GERAIS'));
  out.push(item('8.1.', 'A responsabilidade total da APPCHURCH por eventuais danos decorrentes deste contrato fica limitada ao valor pago pela IGREJA nos 12 (doze) meses anteriores ao fato.'));
  out.push(item('8.2.', 'A tolerância de uma parte quanto ao descumprimento de qualquer obrigação pela outra não implicará novação ou renúncia de direitos.'));
  out.push(item('8.3.', 'As comunicações entre as partes serão válidas quando realizadas por escrito, inclusive por e-mail ou WhatsApp, nos contatos indicados neste instrumento.'));
  out.push(item('8.4.', 'As partes reconhecem a validade da assinatura deste contrato por meio eletrônico ou digital, nos termos da MP nº 2.200-2/2001 e da Lei nº 14.063/2020.'));

  out.push(clause('9ª', 'DO FORO'));
  out.push(item('9.1.', [T('Fica eleito o foro da Comarca de '), val(d.foro, '[Cidade/UF]'), T(' para dirimir quaisquer dúvidas oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.')]));
  out.push(p('E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma, na presença de 2 (duas) testemunhas.'));

  out.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 240 }, children: [val(d.local, '[Cidade/UF]'), T(', '), F('[dia]'), T(' de '), F('[mês]'), T(' de '), F('[ano]'), T('.')] }));

  out.push(...signature('CONTRATADA – APPCHURCH', d.contratada.nome));
  out.push(...signature('CONTRATANTE – IGREJA', c.nome));

  out.push(new Paragraph({ spacing: { before: 480, after: 0 }, children: [B('TESTEMUNHAS:')] }));
  const testemunha = (n) => new TableCell({
    width: { size: W / 2, type: WidthType.DXA },
    borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
    children: [
      new Paragraph({ spacing: { before: 500 }, children: [T(`${n}. ______________________________`)] }),
      new Paragraph({ children: [T('Nome:')] }),
      new Paragraph({ children: [T('CPF:')] }),
    ],
  });
  out.push(new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W / 2, W / 2], rows: [new TableRow({ children: [testemunha(1), testemunha(2)] })] }));

  return new Document({
    creator: 'AppChurch',
    title: 'Contrato AppChurch',
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    numbering: { config: [{ reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1700, bottom: 1134, left: 1134, right: 1134, header: 500 } } },
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
        children: [T('Página ', { size: 18, color: '777777' }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '777777', font: FONT }), T(' de ', { size: 18, color: '777777' }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '777777', font: FONT }), T('   |   Rubricas: ________  ________', { size: 18, color: '777777' })],
      })] }) },
      children: out,
    }],
  });
}

// ---------- 1) Modelo padrão ----------
const modelo = { contratada: {}, contratante: {}, pagamento: { plano: 'Plano Mensal' } };

// ---------- 2) Paz Church Sobral ----------
const paz = {
  contratada: {},
  contratante: { nome: 'Paz Church Sobral' },
  pagamento: { plano: 'Plano Mensal', valor: 'R$ 200,00 (duzentos reais) – Paz Church Sobral (sede), acrescido de R$ 50,00 (cinquenta reais) por igreja da cobertura, conforme Cláusula 3ª' },
  local: 'Sobral/CE',
  foro: 'Sobral/CE',
  condicoesEspeciais: [
    [T('A Paz Church Sobral (sede) pagará o valor mensal de '), B('R$ 200,00 (duzentos reais)'), T('.')],
    [T('Cada uma das '), B('4 (quatro) igrejas sob a cobertura'), T(' da Paz Church Sobral, relacionadas na tabela abaixo, terá acesso à plataforma mediante o valor mensal de '), B('R$ 50,00 (cinquenta reais) por igreja'), T(', perfazendo o total mensal de '), B('R$ 400,00 (quatrocentos reais)'), T(' para o conjunto (sede + 4 igrejas).')],
    [T('O valor de R$ 50,00 (cinquenta reais) por igreja da cobertura poderá ser alterado quando a respectiva igreja '), B('passar de 15 (quinze) células'), T(' cadastradas na plataforma, mediante comunicação prévia da APPCHURCH com antecedência mínima de 30 (trinta) dias, permanecendo inalterados os valores das demais igrejas.')],
    'A Paz Church Sobral é responsável pelo pagamento dos valores de todas as igrejas relacionadas neste contrato, salvo se ajustado por escrito que cada igreja da cobertura pagará diretamente à APPCHURCH.',
    'A inclusão de novas igrejas da cobertura poderá ser feita por aditivo ou por simples troca de e-mails entre as partes, aplicando-se a elas as mesmas condições desta cláusula.',
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

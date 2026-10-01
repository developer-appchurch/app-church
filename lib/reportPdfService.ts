import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface LeadershipReportRow {
  memberName: string;
  cellName: string;
  stageName: string;
  status: 'Concluído' | 'Pendente';
  completedAt?: string;
}

export interface LeadershipReportOptions {
  churchName?: string;
  generatedBy?: string;
  filterContext?: {
    cell?: string;
    sector?: string;
    stage?: string;
    status?: string;
  };
  rows: LeadershipReportRow[];
}

export function generateLeadershipTrackPDF(options: LeadershipReportOptions): void {
  const { churchName, generatedBy, filterContext, rows } = options;

  // Cria documento PDF no formato A4 retrato
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Cabeçalho da Primeira Página
  // Faixa superior com a cor primária #052447
  doc.setFillColor(5, 36, 71);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Nome da Igreja / App
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(churchName?.toUpperCase() || 'APPCHURCH', 14, 12);

  // Título do Relatório
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(186, 230, 253); // sky-200
  doc.text('RELATÓRIO DO TRILHO DE LIDERANÇA', 14, 18);

  // Data / Hora no topo direito
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('pt-BR');
  const timeFormatted = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  doc.setFontSize(8);
  doc.setTextColor(224, 242, 254);
  doc.text(`Emissão: ${dateFormatted} às ${timeFormatted}`, pageWidth - 14, 12, { align: 'right' });
  if (generatedBy) {
    doc.text(`Por: ${generatedBy}`, pageWidth - 14, 18, { align: 'right' });
  }

  // Caixa de Informações dos Filtros Aplicados
  doc.setFillColor(241, 245, 249); // slate-100
  doc.roundedRect(14, 32, pageWidth - 28, 18, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.roundedRect(14, 32, pageWidth - 28, 18, 2, 2, 'S');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42); // slate-900

  const cellText = filterContext?.cell ? `Célula: ${filterContext.cell}` : 'Célula: Todas';
  const sectorText = filterContext?.sector && filterContext.sector !== 'todos' ? `Setor: ${filterContext.sector}` : null;
  const stageText = filterContext?.stage ? `Etapa: ${filterContext.stage}` : 'Etapa: Todas';
  const statusText = filterContext?.status ? `Status: ${filterContext.status}` : 'Status: Todos';

  let filterLine1 = `${cellText}   |   ${stageText}   |   ${statusText}`;
  if (sectorText) {
    filterLine1 = `${sectorText}   |   ${filterLine1}`;
  }

  doc.text(filterLine1, 18, 39);

  // Totais resumidos
  const totalCompleted = rows.filter((r) => r.status === 'Concluído').length;
  const totalPending = rows.filter((r) => r.status === 'Pendente').length;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(
    `Total de Registros: ${rows.length}   •   Concluídos: ${totalCompleted}   •   Pendentes: ${totalPending}`,
    18,
    45
  );

  // Tabela com Nome do Membro, Célula, Etapa do Trilho, Status
  const tableData = rows.map((row) => [
    row.memberName,
    row.cellName || '-',
    row.stageName,
    row.completedAt && row.status === 'Concluído' ? `${row.status}\n(${row.completedAt})` : row.status,
  ]);

  autoTable(doc, {
    startY: 54,
    head: [['Nome do Membro', 'Célula', 'Etapa do Trilho', 'Status']],
    body: tableData,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 3,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [5, 36, 71], // #052447
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 55 }, // Nome do Membro
      1: { cellWidth: 45 }, // Célula
      2: { cellWidth: 52 }, // Etapa do Trilho
      3: { cellWidth: 30, halign: 'center' }, // Status
    },
    didParseCell: (data) => {
      // Colorir o status com visual diferenciado
      if (data.section === 'body' && data.column.index === 3) {
        const text = String(data.cell.raw || '');
        if (text.startsWith('Concluído')) {
          data.cell.styles.textColor = [16, 128, 67]; // Verde esmeralda escuro
          data.cell.styles.fontStyle = 'bold';
        } else if (text.startsWith('Pendente')) {
          data.cell.styles.textColor = [180, 83, 9]; // Âmbar escuro
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    margin: { top: 20, bottom: 20, left: 14, right: 14 },
    didDrawPage: (data) => {
      // Rodapé em todas as páginas
      const str = `Página ${data.pageNumber}`;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(
        'AppChurch • Trilho de Liderança',
        14,
        pageHeight - 10
      );
      doc.text(str, pageWidth - 14, pageHeight - 10, { align: 'right' });
    },
  });

  // Salva e faz download do arquivo PDF
  const cleanDate = dateFormatted.replace(/\//g, '-');
  const fileName = `relatorio-trilho-lideranca-${cleanDate}.pdf`;
  doc.save(fileName);
}

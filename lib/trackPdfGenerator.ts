import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CellMember, CellGroup, TrackStep } from '../types';

export interface GenerateTrackPdfOptions {
  members: CellMember[];
  cells: CellGroup[];
  stages: TrackStep[];
  currentCellName: string;
  selectedStageTitle: string;
  selectedStatusFilter: 'all' | 'completed' | 'pending';
  churchName?: string;
  generatedByName?: string;
  isStepCompleted: (member: CellMember, stepId: string | number, stepNumber?: number) => boolean;
}

export function generateLeadershipTrackPdf(options: GenerateTrackPdfOptions): void {
  const {
    members,
    cells,
    stages,
    currentCellName,
    selectedStageTitle,
    selectedStatusFilter,
    churchName = 'Igreja Local',
    generatedByName,
    isStepCompleted,
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Cabeçalho Visual Corporativo
  doc.setFillColor(5, 36, 71); // #052447
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Título e Subtítulo
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('RELATÓRIO DO TRILHO DE LIDERANÇA', 14, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(186, 215, 248);
  doc.text(`${churchName.toUpperCase()} · Gestão e Trajetória de Discípulos`, 14, 20);

  // Data / Hora no canto direito
  const now = new Date();
  const formattedDate = now.toLocaleDateString('pt-BR');
  const formattedTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  doc.setFontSize(8);
  doc.setTextColor(220, 235, 252);
  doc.text(`Gerado em: ${formattedDate} às ${formattedTime}`, pageWidth - 14, 13, { align: 'right' });
  if (generatedByName) {
    doc.text(`Responsável: ${generatedByName}`, pageWidth - 14, 20, { align: 'right' });
  }

  // 2. Barra de Contexto e Filtros
  doc.setFillColor(243, 246, 250);
  doc.rect(14, 32, pageWidth - 28, 16, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(14, 32, pageWidth - 28, 16, 'S');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);

  // Linha 1 de metadados
  doc.text('Célula / Âmbito:', 18, 38);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(currentCellName || 'Todas as Células', 43, 38);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Filtro de Etapa:', 110, 38);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(selectedStageTitle || 'Todas as Etapas', 133, 38);

  // Linha 2 de metadados
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Filtro de Status:', 18, 44);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const statusLabel =
    selectedStatusFilter === 'completed'
      ? 'Apenas Concluídos'
      : selectedStatusFilter === 'pending'
      ? 'Apenas Pendentes'
      : 'Todos os Status';
  doc.text(statusLabel, 43, 44);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Total Listado:', 110, 44);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(`${members.length} membro(s)`, 133, 44);

  // 3. Montagem dos Dados da Tabela
  const tableRows = members.map((member, idx) => {
    // Busca nome da célula
    const cellMatch = cells.find((c) => c.id === member.cellId);
    const cellName = cellMatch ? cellMatch.name : '—';

    // Determina Etapa e Status
    let stageDisplay = '';
    let statusDisplay = '';

    if (selectedStageTitle !== 'Todas as Etapas') {
      // Filtrado por uma etapa específica
      const matchedStage = stages.find((s) => s.title === selectedStageTitle);
      const isDone = matchedStage
        ? isStepCompleted(member, matchedStage.id, matchedStage.stepNumber)
        : false;
      stageDisplay = selectedStageTitle;
      statusDisplay = isDone ? 'Concluído' : 'Pendente';
    } else {
      // Todas as etapas: identifica a etapa atual ou progresso
      const totalSteps = stages.length || 6;
      const completedSteps = stages.filter((st) =>
        isStepCompleted(member, st.id, st.stepNumber)
      ).length;

      const nextPendingStage = stages.find(
        (st) => !isStepCompleted(member, st.id, st.stepNumber)
      );

      if (completedSteps === totalSteps && totalSteps > 0) {
        stageDisplay = 'Trilho Completo';
        statusDisplay = 'Concluído (100%)';
      } else if (nextPendingStage) {
        stageDisplay = `${nextPendingStage.stepNumber || '•'} - ${nextPendingStage.title}`;
        statusDisplay = `Em Andamento (${completedSteps}/${totalSteps})`;
      } else {
        stageDisplay = stages[0]?.title || 'Etapa 1';
        statusDisplay = `Pendente (${completedSteps}/${totalSteps})`;
      }
    }

    return [
      String(idx + 1),
      member.name || 'Sem Nome',
      cellName,
      stageDisplay,
      statusDisplay,
    ];
  });

  // 4. Renderização com autoTable
  autoTable(doc, {
    startY: 52,
    head: [['#', 'Nome do Membro', 'Célula', 'Etapa do Trilho', 'Status']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [5, 36, 71],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
      cellPadding: 3,
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      valign: 'middle',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 55, fontStyle: 'bold' },
      2: { cellWidth: 35 },
      3: { cellWidth: 52 },
      4: { cellWidth: 30, halign: 'center' },
    },
    didParseCell: (data) => {
      // Coloração no status
      if (data.section === 'body' && data.column.index === 4) {
        const text = String(data.cell.raw || '');
        if (text.startsWith('Concluído')) {
          data.cell.styles.textColor = [22, 101, 52]; // verde escuro
          data.cell.styles.fontStyle = 'bold';
        } else if (text.startsWith('Em Andamento')) {
          data.cell.styles.textColor = [3, 105, 161]; // azul escuro
          data.cell.styles.fontStyle = 'bold';
        } else if (text.startsWith('Pendente')) {
          data.cell.styles.textColor = [180, 83, 9]; // âmbar escuro
        }
      }
    },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      // Rodapé com número da página
      const pageCount = (doc as any).internal.getNumberOfPages();
      const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);

      doc.text(
        'App Church · Relatório de Acompanhamento Espiritual e Liderança',
        14,
        pageHeight - 8
      );

      doc.text(
        `Página ${currentPage} de ${pageCount}`,
        pageWidth - 14,
        pageHeight - 8,
        { align: 'right' }
      );
    },
  });

  // Salva o arquivo no aparelho do usuário
  const cleanScope = (currentCellName || 'geral')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-');
  const filename = `relatorio-trilho-${cleanScope}-${now.toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';

import type { MonthlySummary } from '../../modules/summaries/summaries.service.js';

function kronor(ore: number): string {
  return `${(ore / 100).toFixed(2)} kr`;
}

/** Helvetica WinAnsi saknar å/ä/ö — ASCII-ersättning i PDF-text. */
function pdfSafe(text: string): string {
  return text.replace(/[åä]/gi, 'a').replace(/ö/gi, 'o').replace(/–/g, '-').replace(/—/g, '-');
}

export async function buildMonthlySummaryPdf(
  summary: MonthlySummary,
  opts: { userLabel: string; monthLabel: string },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([595, 842]);
  let y = 800;
  const left = 50;

  const ensureSpace = (needed: number): void => {
    if (y >= needed) return;
    page = doc.addPage([595, 842]);
    y = 800;
  };

  const line = (text: string, size = 11, useBold = false): void => {
    ensureSpace(size + 8);
    page.drawText(pdfSafe(text), {
      x: left,
      y,
      size,
      font: useBold ? bold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= size + 8;
  };

  line('Shiftkit - Manadsrapport', 18, true);
  line(opts.userLabel, 11);
  line(opts.monthLabel, 11);
  y -= 8;

  line(`Pass: ${summary.shiftCount}`);
  line(`Timmar: ${(summary.workedMinutes / 60).toFixed(1)} h`);
  line(`Brutto: ${kronor(summary.grossOre)}`);
  line(`OB: ${kronor(summary.obOre)}`);
  if (summary.sickPayOre > 0) {
    line(`Sjuklon: ${kronor(summary.sickPayOre)}`);
  }
  line(`Skatt (${summary.taxMode}): ${kronor(summary.taxOre)}`);
  line(`Netto: ${kronor(summary.netOre)}`, 12, true);

  if (summary.goalOre != null) {
    y -= 6;
    line(`Lonemal: ${kronor(summary.goalOre)} (${summary.goalProgressPercent} %)`);
    if (summary.goalRemainingOre != null && summary.goalRemainingOre > 0) {
      const hoursLabel =
        summary.hoursToGoalEstimate != null
          ? `ca ${summary.hoursToGoalEstimate} h kvar`
          : 'timmar kvar: okant';
      line(`Kvar till mal: ${kronor(summary.goalRemainingOre)} (${hoursLabel})`, 10);
    } else if (summary.goalRemainingOre === 0) {
      line('Malet ar natt for perioden', 10);
    }
  }

  y -= 12;
  line('Per jobbprofil', 13, true);
  for (const p of summary.byJobProfile) {
    line(
      `${p.name}: ${p.shiftCount} pass, ${(p.workedMinutes / 60).toFixed(1)} h, brutto ${kronor(p.grossOre)}, netto ${kronor(p.netOre)}`,
      9,
    );
  }

  if (summary.sickLeave.length > 0) {
    y -= 10;
    line('Sjukanmalan', 13, true);
    for (const s of summary.sickLeave) {
      line(
        `${s.startDate}-${s.endDate} (${s.profileName}): karens ${s.karensdag ?? '-'}, ${kronor(s.sickPayOre)}`,
        9,
      );
    }
  }

  return doc.save();
}

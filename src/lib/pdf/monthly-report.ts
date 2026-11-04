import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { MonthlySummary } from '../../modules/summaries/summaries.service.js';
import { sum } from 'drizzle-orm';

function kronor(ore: number): string {
  return `${(ore / 100).toFixed(2)} kr`;
}

export async function buildMonthlySummaryPdf(
  summary: MonthlySummary,
  opts: { userLabel: string; monthLabel: string },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const left = 50;
  const line = (text: string, size = 11, useBold = false) => {
    page.drawText(text, {
      x: left,
      y,
      size,
      font: useBold ? bold : font,
      color: rgb(0.1, 0.1, 0.1),
    });

    y -= size + 8;
  };

  line('Shiftkit - Månadsrapport', 18, true);
  line(opts.userLabel, 11);
  line(opts.monthLabel, 11);
  y -= 8;

  line(`Pass: ${summary.shiftCount}`);
  line(`Timmar: ${(summary.workedMinutes / 60).toFixed(1)} h`);
  line(`Brutto: ${kronor(summary.grossOre)}`);
  line(`OB: ${kronor(summary.obOre)}`);
  if (summary.sickPayOre > 0) line(`Sjuklön: ${kronor(summary.sickPayOre)}`);
  line(`Skatt (${summary.taxMode}): ${kronor(summary.taxOre)}`);
  line(`Netto: ${kronor(summary.netOre)}`, 12, true);

  if (summary.goalOre != null) {
    y -= 6;
    line(`Lönemål: ${kronor(summary.goalOre)} (${summary.goalProgressPercent} %)`);
  }

  y -= 12;
  line('Per jobbprofil', 13, true);
  for (const p of summary.byJobProfile) {
    line(
      `${p.name}: ${p.shiftCount} pass, ${(p.workedMinutes / 60).toFixed(1)} h, brutto ${kronor(p.grossOre)}, netto ${kronor(p.netOre)}`,
      9,
    );
    if (y < 60) break;
  }

  if (summary.sickLeave?.length) {
    y -= 10;
    line('Sjukanmälan', 13, true);
    for (const s of summary.sickLeave) {
      line(
        `${s.startDate}–${s.endDate} (${s.profileName}): karens ${s.karensdag ?? '—'}, ${kronor(s.sickPayOre)}`,
        9,
      );
      if (y < 60) break;
    }
  }

  return doc.save();
}

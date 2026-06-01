import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as ExcelJS from 'exceljs';

import { PrismaService } from '../../common/prisma/prisma.service';

import { CreateFaqDto, ReorderItem, UpdateFaqDto } from './dto/faq.dto';

// Columns the import / export / template share. Keeping them in one
// place means the headers an admin sees in the export exactly match the
// headers the import parser looks for — no drift between "what you got"
// and "what we accept back". Lowercase + space-insensitive comparison
// is used on import so the admin can rename headers slightly and still
// have it work.
const FAQ_COLUMNS = [
  { key: 'id', header: 'ID', width: 38 },
  { key: 'category', header: 'Category', width: 22 },
  { key: 'question', header: 'Question', width: 70 },
  { key: 'answer', header: 'Answer', width: 90 },
  { key: 'ordering', header: 'Ordering', width: 12 },
  { key: 'isPublished', header: 'Published', width: 14 },
] as const;

@Injectable()
export class FaqsService {
  constructor(private readonly prisma: PrismaService) {}

  publicList() {
    return this.prisma.faq.findMany({
      where: { isPublished: true },
      orderBy: [{ category: 'asc' }, { ordering: 'asc' }],
    });
  }

  list() {
    return this.prisma.faq.findMany({
      orderBy: [{ category: 'asc' }, { ordering: 'asc' }],
    });
  }

  create(dto: CreateFaqDto) {
    return this.prisma.faq.create({ data: dto });
  }

  async update(id: string, dto: UpdateFaqDto) {
    const existing = await this.prisma.faq.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('FAQ not found');
    return this.prisma.faq.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const existing = await this.prisma.faq.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('FAQ not found');
    await this.prisma.faq.delete({ where: { id } });
    return { deleted: true };
  }

  async reorder(items: ReorderItem[]) {
    await this.prisma.$transaction(
      items.map((i) =>
        this.prisma.faq.update({ where: { id: i.id }, data: { ordering: i.ordering } }),
      ),
    );
    return { reordered: items.length };
  }

  // ── Excel: template, export, import ────────────────────────────────────

  /**
   * An empty .xlsx with the canonical headers and a frozen header row.
   * Two example rows are included so a non-technical admin understands
   * the shape; the importer will skip rows that have no question text.
   */
  async generateTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('FAQs');
    this.applyFaqColumns(ws);

    ws.addRow({
      id: '',
      category: 'Direct Booking',
      question: 'Example: why book directly with us?',
      answer:
        'Example answer. Direct bookings get the best available rate and personalised service.',
      ordering: 0,
      isPublished: 'yes',
    });
    ws.addRow({
      id: '',
      category: 'Flexible Booking',
      question: 'Example: what is your refund policy?',
      answer:
        'Example answer. Cancellations made more than 48 hours before check-in are fully refundable.',
      ordering: 1,
      isPublished: 'yes',
    });

    return this.workbookToBuffer(wb);
  }

  /**
   * Every FAQ currently in the database, in the same column layout as the
   * template, so an admin can round-trip: download → edit in Excel →
   * upload. Empty/missing IDs on re-import become new rows.
   */
  async exportXlsx(): Promise<Buffer> {
    const rows = await this.prisma.faq.findMany({
      orderBy: [{ category: 'asc' }, { ordering: 'asc' }],
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('FAQs');
    this.applyFaqColumns(ws);

    for (const r of rows) {
      ws.addRow({
        id: r.id,
        category: r.category,
        question: r.question,
        answer: r.answer,
        ordering: r.ordering,
        isPublished: r.isPublished ? 'yes' : 'no',
      });
    }

    return this.workbookToBuffer(wb);
  }

  /**
   * Reads an uploaded .xlsx and upserts every row. Match strategy:
   *   - row has ID → update that FAQ (404 = skipped, not a hard error,
   *     so a partially-stale spreadsheet doesn't lose the whole batch)
   *   - row has no ID → create
   * Required per row: Category, Question, Answer. Other columns are
   * optional with sensible defaults (ordering=0, published=yes).
   */
  async importXlsx(buffer: Buffer): Promise<{
    created: number;
    updated: number;
    skipped: number;
    errors: { row: number; reason: string }[];
  }> {
    const wb = new ExcelJS.Workbook();
    try {
      // exceljs's load() signature on Node is happy with a Buffer, but
      // the published .d.ts pins it to ArrayBuffer in some versions;
      // a narrow cast here is correct at runtime.
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException(
        'That file isn’t a valid Excel workbook. Save as .xlsx and try again.',
      );
    }

    const ws = wb.worksheets[0];
    if (!ws) {
      throw new BadRequestException('The workbook is empty.');
    }

    // Build a column index from the header row so admins can rename or
    // reorder columns slightly and still have it work.
    const headerRow = ws.getRow(1);
    const colIndex: Record<string, number> = {};
    headerRow.eachCell((cell, col) => {
      const norm = String(cell.value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');
      if (norm) colIndex[norm] = col;
    });

    const need = (norm: string, fallback?: number) =>
      colIndex[norm] ?? fallback ?? 0;
    const idCol = need('id');
    const categoryCol = need('category');
    const questionCol = need('question');
    const answerCol = need('answer');
    const orderingCol = need('ordering');
    const publishedCol = need('published');

    if (!categoryCol || !questionCol || !answerCol) {
      throw new BadRequestException(
        'Missing required columns. Need at least "Category", "Question", "Answer" in the header row.',
      );
    }

    const cellStr = (row: ExcelJS.Row, col: number): string => {
      if (!col) return '';
      const v = row.getCell(col).value;
      if (v == null) return '';
      if (typeof v === 'string') return v.trim();
      // Excel hyperlink / rich text objects — pull out the .text field
      // they expose so we don't end up with "[object Object]".
      if (typeof v === 'object' && 'text' in v) {
        return String((v as { text: unknown }).text ?? '').trim();
      }
      return String(v).trim();
    };

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: { row: number; reason: string }[] = [];

    // Start at row 2 — row 1 is headers.
    for (let r = 2; r <= ws.rowCount; r += 1) {
      const row = ws.getRow(r);
      const category = cellStr(row, categoryCol);
      const question = cellStr(row, questionCol);
      const answer = cellStr(row, answerCol);

      if (!category && !question && !answer) {
        skipped += 1;
        continue;
      }
      if (!category || !question || !answer) {
        errors.push({
          row: r,
          reason: 'Category, Question and Answer are all required.',
        });
        continue;
      }

      const id = cellStr(row, idCol);
      const orderingRaw = cellStr(row, orderingCol);
      const ordering = orderingRaw === '' ? 0 : Number(orderingRaw);
      if (!Number.isFinite(ordering)) {
        errors.push({
          row: r,
          reason: `Ordering "${orderingRaw}" is not a number.`,
        });
        continue;
      }
      const publishedRaw = cellStr(row, publishedCol).toLowerCase();
      const isPublished =
        publishedRaw === '' ||
        publishedRaw === 'yes' ||
        publishedRaw === 'true' ||
        publishedRaw === '1' ||
        publishedRaw === 'y';

      try {
        if (id) {
          const existing = await this.prisma.faq.findUnique({ where: { id } });
          if (!existing) {
            // Stale ID — don't error the whole import, just create a new
            // row (matches Excel-round-trip intuition: if the row is in
            // the sheet, the admin meant for it to exist).
            await this.prisma.faq.create({
              data: { category, question, answer, ordering, isPublished },
            });
            created += 1;
          } else {
            await this.prisma.faq.update({
              where: { id },
              data: { category, question, answer, ordering, isPublished },
            });
            updated += 1;
          }
        } else {
          await this.prisma.faq.create({
            data: { category, question, answer, ordering, isPublished },
          });
          created += 1;
        }
      } catch (e) {
        errors.push({
          row: r,
          reason: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }

    return { created, updated, skipped, errors };
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private applyFaqColumns(ws: ExcelJS.Worksheet): void {
    ws.columns = FAQ_COLUMNS.map((c) => ({
      key: c.key,
      header: c.header,
      width: c.width,
    }));
    // Style the header row so the spreadsheet is usable when opened.
    const header = ws.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: 'middle' };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  private async workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
    // exceljs returns an ArrayBuffer-like — coerce to a Node Buffer so
    // res.send() / multer accept it without extra wrapping.
    const ab = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    return Buffer.from(ab);
  }
}

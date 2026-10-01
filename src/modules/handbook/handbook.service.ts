import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

// ── DTO helpers ──────────────────────────────────────────────────────────────
// The operator frontend uses a slightly different field naming than the DB
// schema (title/icon/isPublished/scope) while the DB has name/iconUrl and
// no isPublished or scope columns on HandbookCategory.  We normalise here
// instead of changing the schema so existing data and mobile clients stay
// unaffected.

function toCategoryData(dto: Record<string, unknown>) {
  const { title, icon, isPublished: _ip, scope: _sc, scopeId: _sid, ...rest } = dto;
  return {
    ...rest,
    // Map title → name (DB field). Accept either.
    ...(title !== undefined ? { name: title } : {}),
    // Store the emoji in iconUrl — the column is generic String?.
    ...(icon !== undefined ? { iconUrl: icon as string } : {}),
  };
}

function toCategoryView(cat: Record<string, unknown>) {
  const { name, iconUrl, ...rest } = cat;
  return {
    ...rest,
    title: name,
    icon: iconUrl,
    // Provide a default so the frontend toggle doesn't break.
    isPublished: (rest as Record<string, unknown>).isPublished ?? true,
  };
}

function toItemData(dto: Record<string, unknown>) {
  const { content, icon: _icon, pdfUrl: _pdf, propertyId: _pid, ...rest } = dto;
  return {
    ...rest,
    // Map content → body (DB field). Accept either.
    ...(content !== undefined ? { body: content } : {}),
  };
}

function toItemView(item: Record<string, unknown>) {
  const { body, ...rest } = item;
  return { ...rest, content: body };
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class HandbookService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(propertyId?: string) {
    const rows = await this.prisma.handbookCategory.findMany({
      where: propertyId ? { propertyId } : undefined,
      include: {
        items: { orderBy: { ordering: 'asc' } },
      },
      orderBy: { ordering: 'asc' },
    });
    return rows.map(r => ({
      ...toCategoryView(r as unknown as Record<string, unknown>),
      items: r.items.map(i => toItemView(i as unknown as Record<string, unknown>)),
    }));
  }

  async itemDetail(id: string) {
    const item = await this.prisma.handbookItem.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!item) return null;
    return toItemView(item as unknown as Record<string, unknown>);
  }

  createCategory(dto: Record<string, unknown>) {
    return this.prisma.handbookCategory.create({
      data: toCategoryData(dto) as Parameters<typeof this.prisma.handbookCategory.create>[0]['data'],
    });
  }

  updateCategory(id: string, dto: Record<string, unknown>) {
    return this.prisma.handbookCategory.update({
      where: { id },
      data: toCategoryData(dto) as Parameters<typeof this.prisma.handbookCategory.update>[0]['data'],
    });
  }

  removeCategory(id: string) {
    return this.prisma.handbookCategory.delete({ where: { id } });
  }

  createItem(dto: Record<string, unknown>) {
    return this.prisma.handbookItem.create({
      data: toItemData(dto) as Parameters<typeof this.prisma.handbookItem.create>[0]['data'],
    });
  }

  updateItem(id: string, dto: Record<string, unknown>) {
    return this.prisma.handbookItem.update({
      where: { id },
      data: toItemData(dto) as Parameters<typeof this.prisma.handbookItem.update>[0]['data'],
    });
  }

  removeItem(id: string) {
    return this.prisma.handbookItem.delete({ where: { id } });
  }
}

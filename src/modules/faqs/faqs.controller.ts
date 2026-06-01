import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { UserRole } from '@prisma/client';

import { Public } from '../../common/decorators/public.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { CreateFaqDto, ReorderItem, UpdateFaqDto } from './dto/faq.dto';
import { FaqsService } from './faqs.service';

@ApiTags('faqs')
@Controller('faqs')
export class FaqsController {
  constructor(private readonly service: FaqsService) {}

  @Public()
  @Get('public')
  publicList() {
    return this.service.publicList();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @RequirePermission('content.faqs.read')
  @Get()
  list() {
    return this.service.list();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @RequirePermission('content.faqs.create')
  @Post()
  create(@Body() dto: CreateFaqDto) {
    return this.service.create(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @RequirePermission('content.faqs.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFaqDto) {
    return this.service.update(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @RequirePermission('content.faqs.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @RequirePermission('content.faqs.update')
  @HttpCode(HttpStatus.OK)
  @Post('reorder')
  reorder(@Body() body: ReorderItem[]) {
    return this.service.reorder(body);
  }

  // ── Excel: template + export + import ──────────────────────────────────

  /**
   * Empty .xlsx with the right headers + two example rows. Admins
   * download this, fill it in, and upload via the import endpoint.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @RequirePermission('content.faqs.import-export')
  @Get('export/template')
  async downloadTemplate(@Res() res: Response) {
    const buf = await this.service.generateTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="faqs-template.xlsx"',
    );
    res.send(buf);
  }

  /** All current FAQs as a downloadable .xlsx in the same shape as the
   *  template, so admins can round-trip edits. */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @RequirePermission('content.faqs.import-export')
  @Get('export/current')
  async downloadExport(@Res() res: Response) {
    const buf = await this.service.exportXlsx();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="faqs-export.xlsx"',
    );
    res.send(buf);
  }

  /**
   * Import an .xlsx. The body is multipart with a single field named
   * "file". Returns { created, updated, skipped, errors } so the admin
   * UI can render a results summary instead of a silent "OK".
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @RequirePermission('content.faqs.import-export')
  @ApiConsumes('multipart/form-data')
  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async importFromXlsx(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      // Letting it fall through to the service would surface as a
      // generic "isn't an Excel file" — the actual issue is the form
      // didn't include the file field, which is worth being specific
      // about so admins notice the upload widget broke.
      throw new Error('No file uploaded. Field name must be "file".');
    }
    return this.service.importXlsx(file.buffer);
  }
}

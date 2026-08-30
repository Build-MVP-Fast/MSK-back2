import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for POST /invoices/request — the guest-initiated invoice
 * request from the mobile InvoiceRequest screen.
 *
 * `scope` mirrors the three accordion options on the UI: "self",
 * "company", and "someone-else". For "self" the recipient is filled
 * from the user record server-side, so the client can omit
 * recipientName / recipientEmail entirely.
 */
export class RequestInvoiceDto {
  @IsIn(['self', 'company', 'someone-else'])
  scope!: 'self' | 'company' | 'someone-else';

  @IsOptional()
  @IsString()
  @MaxLength(240)
  recipientName?: string;

  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;
}

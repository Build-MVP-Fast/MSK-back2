import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';

import { PublicService } from './public.service';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly service: PublicService) {}

  @Public()
  @Get('search')
  search(@Query() q: any) {
    return this.service.search({
      ...q,
      checkIn: q.checkIn ? new Date(q.checkIn) : undefined,
      checkOut: q.checkOut ? new Date(q.checkOut) : undefined,
      adults: q.adults ? Number(q.adults) : undefined,
      children: q.children ? Number(q.children) : undefined,
      amenities: q.amenities ? (Array.isArray(q.amenities) ? q.amenities : [q.amenities]) : undefined,
      minPrice: q.minPrice ? Number(q.minPrice) : undefined,
      maxPrice: q.maxPrice ? Number(q.maxPrice) : undefined,
      page: q.page ? Number(q.page) : undefined,
      pageSize: q.pageSize ? Number(q.pageSize) : undefined,
    });
  }

  @Public()
  @Get('featured')
  featured() {
    return this.service.featured();
  }

  @Public()
  @Get('cities')
  cities() {
    return this.service.distinctCities();
  }
}

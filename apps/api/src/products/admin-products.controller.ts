import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { AdminGuard, AuthGuard } from '../auth/guards';
import { CreateProductDto } from './dto';
import { ProductsService, type PublicProduct } from './products.service';

/**
 * Product administration. Admin-only, top to bottom.
 *
 * The public `GET /api/products` shows what is on sale; this one shows
 * everything, because an admin needs to see an inactive product to know its
 * slug is taken.
 */
@Controller('admin/products')
@UseGuards(AuthGuard, AdminGuard)
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(): Promise<PublicProduct[]> {
    return this.products.listAll();
  }

  @Post()
  create(@Body() dto: CreateProductDto): Promise<PublicProduct> {
    return this.products.create(dto);
  }
}

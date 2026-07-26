import { Controller, Get } from '@nestjs/common';

import { ProductsService, type PublicProduct } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  /** Public — the menu is visible before anyone signs in. */
  @Get()
  list(): Promise<PublicProduct[]> {
    return this.products.listActive();
  }
}

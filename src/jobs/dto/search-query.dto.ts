// Query params for GET /api/jobs/search — full-text search with pagination.
import { IsOptional, IsString, MinLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

export class SearchQueryDto extends PaginationQueryDto {
  @IsString()
  @MinLength(1)
  q!: string;

  @IsOptional()
  @IsString()
  sort?: string;
}

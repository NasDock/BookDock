import { ApiProperty } from '@nestjs/swagger';
import { BookResponseDto } from '../../books/dto/books.dto';

export class RecommendationsResponseDto {
  @ApiProperty({ type: [BookResponseDto] })
  books: BookResponseDto[];
}

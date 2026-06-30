// Optional note when saving or updating a saved job.
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class UpdateNoteDto {
  @IsString()
  @MaxLength(2000)
  note!: string;
}

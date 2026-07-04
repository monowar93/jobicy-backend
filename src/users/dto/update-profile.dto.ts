// PATCH /users/me/profile — partial career profile update.
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  experienceYears?: number;

  @IsOptional()
  @IsString()
  currentRole?: string | null;

  @IsOptional()
  @IsString()
  targetRole?: string | null;

  @IsOptional()
  @IsString()
  preferredLocation?: string | null;
}

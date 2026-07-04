// Users/profile routes — career profile, match score, recommendations.
import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { JwtPayload } from '@/common/types/authed-request.type';
import { RecommendationsQueryDto } from '@/users/dto/recommendations-query.dto';
import { UpdateProfileDto } from '@/users/dto/update-profile.dto';
import { UsersService } from '@/users/users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** Authenticated user with career profile. */
  @Get('me')
  getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.getMe(user.id);
  }

  /** Update career profile fields. */
  @Patch('me/profile')
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  /** Percentage of active jobs matching the user's profile. */
  @Get('me/match-score')
  matchScore(@CurrentUser() user: JwtPayload) {
    return this.usersService.matchScore(user.id);
  }

  /** Jobs ranked by skill overlap with the user's profile. */
  @Get('me/recommendations')
  recommendations(
    @CurrentUser() user: JwtPayload,
    @Query() query: RecommendationsQueryDto,
  ) {
    return this.usersService.recommendations(user.id, query.limit ?? 10);
  }
}

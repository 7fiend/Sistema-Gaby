-- CreateEnum
CREATE TYPE "WeekDay" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "MealTime" AS ENUM ('BREAKFAST', 'MORNING_SNACK', 'LUNCH', 'AFTERNOON_SNACK', 'DINNER');

-- CreateEnum
CREATE TYPE "ProductUsageType" AS ENUM ('RECIPE', 'ROUTINE');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "usageType" "ProductUsageType" NOT NULL DEFAULT 'RECIPE';

-- CreateTable
CREATE TABLE "weekly_menu_slots" (
    "id" TEXT NOT NULL,
    "dayOfWeek" "WeekDay" NOT NULL,
    "mealTime" "MealTime" NOT NULL,
    "categoryId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_menu_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_menu_slots_dayOfWeek_mealTime_categoryId_key" ON "weekly_menu_slots"("dayOfWeek", "mealTime", "categoryId");

-- AddForeignKey
ALTER TABLE "weekly_menu_slots" ADD CONSTRAINT "weekly_menu_slots_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_menu_slots" ADD CONSTRAINT "weekly_menu_slots_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

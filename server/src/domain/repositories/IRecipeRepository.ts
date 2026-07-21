import type {
  Paginated,
  RecipeCreateInput,
  RecipeReviseInput,
  RecipeUpdateInput,
  RecipesQuery,
} from '@gaby/shared';

export interface RecipeListItem {
  id: string;
  name: string;
  category: { id: string; name: string };
  imageUrl: string | null;
  prepTimeMinutes: number;
  yieldPortions: number;
  targetMarginPct: number;
  currentCost: number;
  costPerPortion: number;
  suggestedPrice: number;
  /** Precio real de venta fijado a mano por el dueño; null = aún no definido. */
  sellingPrice: number | null;
  isActive: boolean;
  currentVersionNumber: number;
}

export interface RecipeIngredientDetail {
  productId: string;
  productName: string;
  productCode: string;
  quantity: number;
  unit: { id: string; abbreviation: string };
  /** cantidad convertida a unidad base × costo promedio vigente */
  currentCost: number;
}

export interface RecipeDetail extends RecipeListItem {
  description: string | null;
  ingredients: RecipeIngredientDetail[];
  steps: string[];
  notes: string | null;
  versions: { versionNumber: number; createdAt: Date; createdBy: string; isCurrent: boolean }[];
}

export interface IRecipeRepository {
  list(query: RecipesQuery): Promise<Paginated<RecipeListItem>>;
  findById(id: string): Promise<RecipeDetail | null>;
  /** Crea receta + versión 1 + ingredientes y calcula costos vigentes. Atómico. */
  create(input: RecipeCreateInput, userId: string): Promise<RecipeDetail>;
  /** Solo información general; recalcula precio si cambia margen/rendimiento. */
  update(id: string, input: RecipeUpdateInput): Promise<RecipeDetail>;
  /** Nueva versión con ingredientes/pasos (RF-02.5). Atómico. */
  revise(id: string, input: RecipeReviseInput, userId: string): Promise<RecipeDetail>;
  setActive(id: string, isActive: boolean): Promise<void>;

  /**
   * Recálculo en cascada (RF-02.4): recalcula costo vigente de todas las
   * recetas cuya versión ACTUAL usa alguno de estos productos.
   * Devuelve los ids de recetas afectadas (para el evento recipe:cost-changed).
   */
  recalculateForProducts(productIds: string[]): Promise<string[]>;
}

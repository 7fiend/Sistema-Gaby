/**
 * Sistema Gaby — Seed de datos de prueba (RNF-08)
 * Se ejecuta con: npm run db:seed (configurado en Fase 5)
 *
 * Crea: roles + permisos, usuarios de prueba, unidades, categorías,
 * proveedores, productos con lotes, recetas colombianas realistas,
 * configuración del sistema y una orden de producción de ejemplo.
 *
 * Idempotente: usa upsert / verificaciones para poder re-ejecutarse.
 */
import { PrismaClient, CategoryKind, UnitKind } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Matriz de permisos (espejo de shared/permissions — matriz §2 del análisis)
// ---------------------------------------------------------------------------
const RESOURCES_ACTIONS: Record<string, string[]> = {
  dashboard: ['read'],
  recipes: ['read', 'create', 'update', 'deactivate'],
  products: ['read', 'create', 'update', 'deactivate'],
  inventory: ['read', 'entry', 'adjust', 'waste'],
  production: ['read', 'create', 'confirm', 'cancel', 'close', 'start', 'complete'],
  delivery: ['read', 'deliver'],
  kitchen: ['read'],
  sales: ['read', 'create'],
  expenses: ['read', 'create', 'update'],
  reports: ['read', 'generate', 'export'],
  audit: ['read'],
  users: ['read', 'create', 'update', 'deactivate'],
  settings: ['read', 'update'],
  backups: ['read', 'create', 'restore'],
  categories: ['create', 'update', 'deactivate'],
  menu: ['read', 'update'],
  routine: ['register'],
};

const ROLE_GRANTS: Record<string, (r: string, a: string) => boolean> = {
  ADMIN: () => true,
  INVENTORY: (r, a) =>
    (r === 'delivery' && ['read', 'deliver'].includes(a)) ||
    (r === 'inventory' && a === 'read') ||
    (r === 'products' && a === 'read') ||
    (r === 'production' && a === 'read') ||
    (r === 'menu' && a === 'read') ||
    (r === 'routine' && a === 'register'),
  KITCHEN: (r, a) => (r === 'kitchen' && a === 'read') || (r === 'menu' && a === 'read'),
  AUDITOR: (_r, a) => a === 'read',
};

async function seedAuth() {
  const permissions = [];
  for (const [resource, actions] of Object.entries(RESOURCES_ACTIONS)) {
    for (const action of actions) {
      permissions.push(
        await prisma.permission.upsert({
          where: { resource_action: { resource, action } },
          update: {},
          create: { resource, action },
        }),
      );
    }
  }

  const roleDescriptions: Record<string, string> = {
    ADMIN: 'Acceso total al sistema',
    INVENTORY: 'Entrega de productos y consulta de inventario',
    KITCHEN: 'Monitor de producción del día (solo lectura)',
    AUDITOR: 'Solo lectura de todo el sistema',
  };

  for (const [name, grants] of Object.entries(ROLE_GRANTS)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: roleDescriptions[name], isSystem: true },
    });
    for (const p of permissions) {
      if (grants(p.resource, p.action)) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
          update: {},
          create: { roleId: role.id, permissionId: p.id },
        });
      }
    }
  }

  const users = [
    { username: 'admin', fullName: 'Gabriela Administradora', role: 'ADMIN' },
    { username: 'bodega', fullName: 'Carlos Bodega', role: 'INVENTORY' },
    { username: 'cocina', fullName: 'Monitor Cocina', role: 'KITCHEN' },
    { username: 'auditor', fullName: 'Ana Auditora', role: 'AUDITOR' },
  ];
  // Contraseña de desarrollo para todos: "Gaby2026*" — cambiar en producción.
  const passwordHash = await argon2.hash('Gaby2026*');
  for (const u of users) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: u.role } });
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { username: u.username, fullName: u.fullName, passwordHash, roleId: role.id },
    });
  }
}

async function seedUnits() {
  const units = [
    { name: 'Kilogramo', abbreviation: 'kg', kind: UnitKind.WEIGHT, factorToBase: 1 },
    { name: 'Gramo', abbreviation: 'g', kind: UnitKind.WEIGHT, factorToBase: 0.001 },
    { name: 'Libra', abbreviation: 'lb', kind: UnitKind.WEIGHT, factorToBase: 0.453592 },
    { name: 'Litro', abbreviation: 'l', kind: UnitKind.VOLUME, factorToBase: 1 },
    { name: 'Mililitro', abbreviation: 'ml', kind: UnitKind.VOLUME, factorToBase: 0.001 },
    { name: 'Unidad', abbreviation: 'und', kind: UnitKind.COUNT, factorToBase: 1 },
    { name: 'Paquete', abbreviation: 'paq', kind: UnitKind.COUNT, factorToBase: 1 },
  ];
  for (const u of units) {
    await prisma.unit.upsert({ where: { abbreviation: u.abbreviation }, update: {}, create: u });
  }
}

async function seedCategories() {
  const cats: Array<[CategoryKind, string]> = [
    [CategoryKind.PRODUCT, 'Carnes'],
    [CategoryKind.PRODUCT, 'Verduras'],
    [CategoryKind.PRODUCT, 'Granos y cereales'],
    [CategoryKind.PRODUCT, 'Bebidas'],
    [CategoryKind.PRODUCT, 'Aceites y grasas'],
    [CategoryKind.PRODUCT, 'Condimentos'],
    [CategoryKind.PRODUCT, 'Empaques'],
    [CategoryKind.RECIPE, 'Almuerzos'],
    [CategoryKind.RECIPE, 'Bandejas'],
    [CategoryKind.RECIPE, 'Sopas'],
    [CategoryKind.EXPENSE, 'Servicios'],
    [CategoryKind.EXPENSE, 'Nómina'],
    [CategoryKind.EXPENSE, 'Transporte'],
    [CategoryKind.EXPENSE, 'Compras'],
    [CategoryKind.EXPENSE, 'Imprevistos'],
    [CategoryKind.EXPENSE, 'Otros'],
  ];
  for (const [kind, name] of cats) {
    await prisma.category.upsert({
      where: { kind_name: { kind, name } },
      update: {},
      create: { kind, name },
    });
  }
}

async function seedSuppliers() {
  for (const name of ['Carnes El Novillo', 'Plaza de Mercado', 'Distribuidora La Cosecha']) {
    await prisma.supplier.upsert({ where: { name }, update: {}, create: { name } });
  }
}

// [código, nombre, categoría, unidad, stock, mínimo, costo/und base COP, pesable]
const PRODUCTS: Array<[string, string, string, string, number, number, number, boolean]> = [
  ['CAR-001', 'Carne de res', 'Carnes', 'kg', 80, 20, 22000, true],
  ['CAR-002', 'Pechuga de pollo', 'Carnes', 'kg', 60, 15, 14500, true],
  ['CAR-003', 'Carne de cerdo', 'Carnes', 'kg', 40, 10, 18000, true],
  ['GRA-001', 'Arroz', 'Granos y cereales', 'kg', 100, 30, 4200, true],
  ['GRA-002', 'Frijol', 'Granos y cereales', 'kg', 50, 15, 9500, true],
  ['GRA-003', 'Lenteja', 'Granos y cereales', 'kg', 40, 10, 7800, true],
  ['VER-001', 'Papa', 'Verduras', 'kg', 90, 25, 2800, true],
  ['VER-002', 'Yuca', 'Verduras', 'kg', 45, 15, 3200, true],
  ['VER-003', 'Plátano', 'Verduras', 'kg', 50, 15, 2500, true],
  ['VER-004', 'Cebolla', 'Verduras', 'kg', 30, 10, 3500, true],
  ['VER-005', 'Tomate', 'Verduras', 'kg', 30, 10, 4000, true],
  ['VER-006', 'Zanahoria', 'Verduras', 'kg', 25, 8, 3000, true],
  ['VER-007', 'Lechuga', 'Verduras', 'kg', 15, 5, 4500, true],
  ['ACE-001', 'Aceite vegetal', 'Aceites y grasas', 'l', 40, 10, 9800, true],
  ['CON-001', 'Sal', 'Condimentos', 'kg', 20, 5, 1800, true],
  ['CON-002', 'Comino', 'Condimentos', 'kg', 3, 1, 28000, true],
  ['BEB-001', 'Panela', 'Bebidas', 'kg', 30, 10, 5200, true],
  ['EMP-001', 'Bandeja desechable', 'Empaques', 'und', 500, 100, 350, false],
  ['EMP-002', 'Vaso 12 oz', 'Empaques', 'und', 800, 200, 120, false],
];

async function seedProducts() {
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { name: 'Plaza de Mercado' } });
  for (const [code, name, cat, unit, stock, min, cost, weighable] of PRODUCTS) {
    const category = await prisma.category.findUniqueOrThrow({
      where: { kind_name: { kind: CategoryKind.PRODUCT, name: cat } },
    });
    const unitRow = await prisma.unit.findUniqueOrThrow({ where: { abbreviation: unit } });
    const product = await prisma.product.upsert({
      where: { code },
      update: {},
      create: {
        code, name,
        categoryId: category.id,
        supplierId: supplier.id,
        unitId: unitRow.id,
        currentStock: stock, minStock: min,
        avgCost: cost, lastCost: cost,
        isWeighable: weighable,
        location: 'Bodega principal',
      },
    });
    // Lote inicial (vence en 30 días los perecederos; empaques sin vencimiento)
    const perishable = !['Empaques', 'Condimentos'].includes(cat);
    await prisma.productBatch.upsert({
      where: { productId_batchNumber: { productId: product.id, batchNumber: 'LOTE-INICIAL' } },
      update: {},
      create: {
        productId: product.id,
        batchNumber: 'LOTE-INICIAL',
        initialQuantity: stock,
        remainingQuantity: stock,
        unitCost: cost,
        expiryDate: perishable ? new Date(Date.now() + 30 * 24 * 3600 * 1000) : null,
      },
    });
  }
}

// [nombre, categoría, porciones, minutos, ingredientes: [código, cantidad, unidad]]
const RECIPES: Array<[string, string, number, number, Array<[string, number, string]>]> = [
  ['Almuerzo Ejecutivo', 'Almuerzos', 10, 90, [
    ['CAR-001', 2.5, 'kg'], ['GRA-001', 2.0, 'kg'], ['VER-001', 1.5, 'kg'],
    ['VER-007', 0.5, 'kg'], ['ACE-001', 0.3, 'l'], ['CON-001', 0.05, 'kg'],
    ['EMP-001', 10, 'und'],
  ]],
  ['Bandeja Especial', 'Bandejas', 10, 120, [
    ['CAR-003', 2.0, 'kg'], ['CAR-002', 1.5, 'kg'], ['GRA-001', 2.5, 'kg'],
    ['GRA-002', 1.2, 'kg'], ['VER-003', 2.0, 'kg'], ['ACE-001', 0.4, 'l'],
    ['CON-001', 0.06, 'kg'], ['EMP-001', 10, 'und'],
  ]],
  ['Sopa del Día', 'Sopas', 10, 60, [
    ['CAR-002', 1.0, 'kg'], ['VER-001', 2.0, 'kg'], ['VER-002', 1.0, 'kg'],
    ['VER-006', 0.5, 'kg'], ['VER-004', 0.3, 'kg'], ['CON-001', 0.04, 'kg'],
    ['CON-002', 0.01, 'kg'],
  ]],
];

async function seedRecipes() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
  for (const [name, cat, portions, minutes, ingredients] of RECIPES) {
    const category = await prisma.category.findUniqueOrThrow({
      where: { kind_name: { kind: CategoryKind.RECIPE, name: cat } },
    });
    const existing = await prisma.recipe.findUnique({
      where: { name_categoryId: { name, categoryId: category.id } },
    });
    if (existing) continue;

    // Costo del lote de rendimiento = Σ(cantidad_en_unidad_base × avgCost)
    let totalCost = 0;
    for (const [code, qty, unitAbbr] of ingredients) {
      const product = await prisma.product.findUniqueOrThrow({ where: { code } });
      const unit = await prisma.unit.findUniqueOrThrow({ where: { abbreviation: unitAbbr } });
      totalCost += qty * Number(unit.factorToBase) * Number(product.avgCost);
    }
    const costPerPortion = totalCost / portions;
    const marginPct = 60;
    const suggestedPrice = Math.ceil(costPerPortion / (1 - marginPct / 100) / 100) * 100;

    const recipe = await prisma.recipe.create({
      data: {
        name, categoryId: category.id,
        yieldPortions: portions, prepTimeMinutes: minutes,
        targetMarginPct: marginPct,
        currentCost: totalCost, costPerPortion, suggestedPrice,
        description: `Receta estándar de ${name.toLowerCase()} para ${portions} porciones.`,
      },
    });
    const version = await prisma.recipeVersion.create({
      data: {
        recipeId: recipe.id, versionNumber: 1, isCurrent: true,
        createdById: admin.id,
        steps: [
          { order: 1, text: 'Alistar y pesar todos los ingredientes según la orden.' },
          { order: 2, text: 'Preparar las proteínas con los condimentos indicados.' },
          { order: 3, text: 'Cocinar guarniciones (arroz, granos, verduras).' },
          { order: 4, text: 'Emplatar según el estándar de la casa.' },
        ],
      },
    });
    for (const [code, qty, unitAbbr] of ingredients) {
      const product = await prisma.product.findUniqueOrThrow({ where: { code } });
      const unit = await prisma.unit.findUniqueOrThrow({ where: { abbreviation: unitAbbr } });
      await prisma.recipeIngredient.create({
        data: { recipeVersionId: version.id, productId: product.id, quantity: qty, unitId: unit.id },
      });
    }
  }
}

async function seedSettings() {
  const settings: Array<[string, unknown]> = [
    ['scale.toleranceKg', 0.05], // ±50 g por defecto (RN-04)
    ['scale.stableSamples', 5], // lecturas estables requeridas (RF-06.4)
    ['scale.stableDeltaKg', 0.005],
    ['costing.defaultMarginPct', 60],
    ['inventory.expiryAlertDays', 5],
    ['auth.maxFailedAttempts', 5],
    ['auth.lockMinutes', 15],
    ['backup.schedule', '0 2 * * *'], // 2:00 a.m. diario
    ['backup.retentionCount', 14],
  ];
  for (const [key, value] of settings) {
    await prisma.appSetting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as any },
    });
  }
}

async function main() {
  console.log('🌱 Sembrando datos de prueba…');
  await seedAuth();
  await seedUnits();
  await seedCategories();
  await seedSuppliers();
  await seedProducts();
  await seedRecipes();
  await seedSettings();
  console.log('✅ Seed completado. Usuarios: admin / bodega / cocina / auditor — clave: Gaby2026*');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

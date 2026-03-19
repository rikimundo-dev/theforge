# components/ui

Componentes Kreo para TheForge. Tema: negro, carbón, dorado (Corporate/Luxury).

## Componentes

| Componente | Uso |
|------------|-----|
| **Button** | Botón con variantes: default, secondary, outline, ghost, destructive, link. Tamaños: default, sm, lg, icon. Prop `loading`. |
| **Input** | Input de texto con estilos Kreo. |
| **Card** | Tarjeta con variantes default, bordered, elevated, ghost. Subcomponentes: CardHeader, CardContent, CardFooter, CardTitle, CardDescription. |
| **Badge** | Etiqueta con variantes: default, secondary, destructive, outline, success, warning. |
| **Dialog** | Modal (Radix). DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter. |
| **AlertDialog** | Diálogo de confirmación (Radix). Para acciones destructivas o críticas. |
| **EmptyState** | Estado vacío con icono, título, descripción y acción opcional. |

## Dependencias

- `clsx`, `tailwind-merge` — utilidad `cn()`
- `class-variance-authority` — variantes de Button/Badge
- `@radix-ui/react-dialog` — Dialog
- `@radix-ui/react-alert-dialog` — AlertDialog
- `tailwindcss-animate` — animaciones

## Tema

Variables CSS en `index.css`: `--primary`, `--background`, `--foreground`, `--card`, `--border`, etc. Ver `docs` del MCP Kreo para el tema completo.

# Japan Trip Planner — MVP

This archive is a cleaned MVP build based on the current project.

## Included

- JSON trip content
- typed content models
- ContentService
- TripStateStore / UserStateStore
- RecommendationService
- Dashboard
- localStorage-backed user state

## Intentionally postponed

- real weather API
- Fuji visibility scoring
- planner/timeline engine
- schedule calculation service
- photo blob / IndexedDB storage
- food recommendation engine
- Google Maps routing

The placeholder services that contained plain text instead of TypeScript were removed from the MVP build.

## Run

```bash
npm install
ng serve
```

Then open:

http://localhost:4200

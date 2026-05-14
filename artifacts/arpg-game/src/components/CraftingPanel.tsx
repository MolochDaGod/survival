import React, { useMemo, useState } from 'react';
import { RECIPES, Recipe, CraftingStation } from '../game/survival/Recipes';
import { SURVIVAL_ITEMS } from '../game/survival/SurvivalItems';

interface CraftingPanelProps {
  /** Stacks the player currently owns (used to gate recipes). */
  stacks: Array<{ itemId: string; count: number }>;
  /** Stations the player is in range of right now. */
  nearbyStations: CraftingStation[];
  onCraft: (recipeId: string) => void;
  onClose: () => void;
}

const STATION_LABELS: Record<CraftingStation, string> = {
  none:         'Hand',
  campfire:     'Campfire',
  cooking_rack: 'Cooking Rack',
  workbench:    'Workbench',
  drying_rack:  'Drying Rack',
};

/** True when every input requirement is satisfied. */
function canCraft(recipe: Recipe, stacks: Array<{ itemId: string; count: number }>): boolean {
  for (const req of recipe.inputs) {
    const have = stacks.find((s) => s.itemId === req.itemId)?.count ?? 0;
    // qty: 0 means "must own one but it isn't consumed" (e.g. knife to fillet).
    if (req.qty === 0) {
      if (have <= 0) return false;
    } else if (have < req.qty) return false;
  }
  return true;
}

const RecipeRow: React.FC<{
  recipe: Recipe;
  stacks: Array<{ itemId: string; count: number }>;
  stationAvailable: boolean;
  onCraft: () => void;
}> = ({ recipe, stacks, stationAvailable, onCraft }) => {
  const inputsOk = canCraft(recipe, stacks);
  const enabled = inputsOk && stationAvailable;
  const iconDef = SURVIVAL_ITEMS[recipe.iconItemId];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 12px',
      background: 'rgba(20,28,40,0.6)',
      border: `1px solid ${enabled ? 'rgba(134,195,74,0.35)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: '6px',
      marginBottom: '6px',
      opacity: stationAvailable ? 1 : 0.45,
    }}>
      <div style={{
        width: '48px', height: '48px',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '6px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '24px',
      }}>
        {iconDef?.icon ?? '?'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>{recipe.name}</div>
        <div style={{ fontSize: '11px', color: '#7a8392', marginTop: '2px' }}>{recipe.description}</div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
          {recipe.inputs.map((inp) => {
            const def = SURVIVAL_ITEMS[inp.itemId];
            const have = stacks.find((s) => s.itemId === inp.itemId)?.count ?? 0;
            const need = inp.qty || 1;
            const ok = inp.qty === 0 ? have > 0 : have >= inp.qty;
            return (
              <div
                key={inp.itemId}
                style={{
                  fontSize: '11px', fontFamily: 'monospace',
                  color: ok ? '#86c34a' : '#ff6b6b',
                  background: 'rgba(0,0,0,0.4)',
                  padding: '2px 6px', borderRadius: '3px',
                }}
                title={def?.name ?? inp.itemId}
              >
                {def?.icon ?? '·'} {have}/{inp.qty === 0 ? `${need}*` : need}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
        <div style={{ fontSize: '10px', color: '#7a8392', fontFamily: 'monospace' }}>
          {recipe.craftTime}s · {STATION_LABELS[recipe.station]}
        </div>
        <button
          disabled={!enabled}
          onClick={onCraft}
          style={{
            background: enabled
              ? 'linear-gradient(180deg, #ff8f00, #e65100)'
              : 'rgba(255,255,255,0.05)',
            color: enabled ? '#fff' : '#555',
            border: 'none',
            padding: '6px 16px',
            borderRadius: '4px',
            cursor: enabled ? 'pointer' : 'not-allowed',
            fontSize: '12px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
          }}
        >
          CRAFT
        </button>
      </div>
    </div>
  );
};

export const CraftingPanel: React.FC<CraftingPanelProps> = ({
  stacks,
  nearbyStations,
  onCraft,
  onClose,
}) => {
  const [filter, setFilter] = useState<'all' | 'available'>('all');

  const groupedRecipes = useMemo(() => {
    const byStation: Record<CraftingStation, Recipe[]> = {
      none: [], campfire: [], cooking_rack: [], workbench: [], drying_rack: [],
    };
    for (const r of RECIPES) byStation[r.station].push(r);
    return byStation;
  }, []);

  const isStationAvailable = (s: CraftingStation) =>
    s === 'none' || nearbyStations.includes(s);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 80,
      backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        width: '640px', maxWidth: '92vw', maxHeight: '88vh',
        background: 'linear-gradient(180deg, #121823, #0a0f17)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', letterSpacing: '0.06em' }}>
              CRAFTING
            </div>
            <div style={{ fontSize: '11px', color: '#7a8392', fontFamily: 'monospace', marginTop: '2px' }}>
              Nearby: {nearbyStations.length === 0 ? 'none' : nearbyStations.map((s) => STATION_LABELS[s]).join(', ')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setFilter(filter === 'all' ? 'available' : 'all')}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#cdd2d8', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer',
                fontFamily: 'monospace', fontSize: '11px',
              }}
            >
              {filter === 'all' ? 'SHOW AVAILABLE' : 'SHOW ALL'}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                color: '#cdd2d8', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer',
                fontFamily: 'monospace', fontSize: '12px',
              }}
            >
              CLOSE [C]
            </button>
          </div>
        </div>

        <div style={{ padding: '14px 18px', overflowY: 'auto', flex: 1 }}>
          {(['none', 'workbench', 'campfire', 'cooking_rack', 'drying_rack'] as CraftingStation[]).map((station) => {
            const list = groupedRecipes[station]
              .filter((r) => filter === 'all' || (canCraft(r, stacks) && isStationAvailable(station)));
            if (list.length === 0) return null;
            return (
              <div key={station} style={{ marginBottom: '14px' }}>
                <div style={{
                  fontSize: '11px', letterSpacing: '0.18em',
                  color: '#7a8392', marginBottom: '6px',
                  textTransform: 'uppercase',
                }}>
                  {STATION_LABELS[station]}
                </div>
                {list.map((r) => (
                  <RecipeRow
                    key={r.id}
                    recipe={r}
                    stacks={stacks}
                    stationAvailable={isStationAvailable(station)}
                    onCraft={() => onCraft(r.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

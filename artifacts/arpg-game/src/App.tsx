import { useState } from 'react';
import { CharacterCreation } from '@/components/CharacterCreation';
import { CharacterSelect } from '@/components/CharacterSelect';
import { GameCanvas } from '@/components/GameCanvas';
import { LoginScreen } from '@/components/LoginScreen';
import { CharacterConfig, DEFAULT_CHARACTER_CONFIG } from '@/game/CharacterConfig';
import { saveCharacter } from '@/game/characterStorage';
import { setActiveCharacterId } from '@/game/activeCharacter';
import { resetSaveGameService } from '@/game/SaveGameService';
import type { Identity } from '@/game/identity';

type Screen = 'login' | 'select' | 'creation' | 'game';

function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [characterConfig, setCharacterConfig] = useState<CharacterConfig>(DEFAULT_CHARACTER_CONFIG);

  const handleSignedIn = (id: Identity) => {
    setIdentity(id);
    setScreen('select');
  };

  const handlePlayCharacter = (
    acctId: string,
    _characterId: string,
    config: CharacterConfig | null,
  ) => {
    setAccountId(acctId);
    setCharacterConfig(config ?? DEFAULT_CHARACTER_CONFIG);
    // CharacterSelect already called setActiveCharacterId + resetSaveGameService.
    setScreen(config ? 'game' : 'creation');
  };

  const handleCreateNew = (acctId: string) => {
    setAccountId(acctId);
    // Defensively clear any stale active character so a failed create
    // doesn't leak save writes into another character's namespace.
    setActiveCharacterId(null);
    resetSaveGameService();
    setScreen('creation');
  };

  const handleCreationComplete = async (config: CharacterConfig) => {
    setCharacterConfig(config);
    if (accountId) {
      try {
        const res = await fetch('/api/characters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId, name: config.name, config }),
        });
        if (res.ok) {
          const row = (await res.json()) as { id: string };
          setActiveCharacterId(row.id);
          resetSaveGameService();
        } else {
          console.warn('[App] character create failed', res.status);
        }
      } catch (err) {
        console.warn('[App] character create errored, continuing offline', err);
      }
    }
    // Persist character config locally (now under the active character key).
    saveCharacter(config);
    setScreen('game');
  };

  if (screen === 'login') {
    return <LoginScreen onSignedIn={handleSignedIn} />;
  }

  if (screen === 'select' && identity) {
    return (
      <CharacterSelect
        identity={identity}
        onPlayCharacter={handlePlayCharacter}
        onCreateNew={handleCreateNew}
      />
    );
  }

  if (screen === 'creation') {
    return (
      <CharacterCreation
        onComplete={handleCreationComplete}
        savedConfig={null}
      />
    );
  }

  // Reserved for downstream wiring — identity drives SaveGameService's
  // grudge-id internally via getGrudgeId(); explicitly threading it
  // through here keeps the option open for HUD display, etc.
  void identity;

  // Keyed by backgroundId so changing Origin (e.g. via "rebuild character"
  // flows we may add later) atomically tears down the engine + HUD together
  // and rebuilds them from the new starting loadout. Without this, the
  // engine effect re-runs on characterConfig change but the HUD's frozen
  // useState init stays on the old loadout, causing weapon-icon drift.
  return <GameCanvas key={characterConfig?.backgroundId ?? 'default'} characterConfig={characterConfig} />;
}

export default App;

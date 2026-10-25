// Music and sound credits, in roughly the order you first hear each one.
export const CREDITS = [
  { group: 'Music', title: 'Dark Suspense Thriller (main theme)', credit: 'Alex Morgan via Pixabay',
    file: 'music/alex-morgan-dark-suspense-thriller-528314.mp3', use: 'Title screen' },
  { group: 'Sound effects', title: 'Failing Reactor Hum', credit: 'Original sound design',
    file: 'sound_effects/01_failing_reactor_hum.wav', use: 'Station ambience' },
  { group: 'Sound effects', title: 'Teleporter Instability', credit: 'Original sound design',
    file: 'sound_effects/05_teleporter_instability.wav', use: 'Teleporter lab, the creature waking and hunting' },
  { group: 'Sound effects', title: 'Distant Corridor Footsteps', credit: 'Original sound design',
    file: 'sound_effects/06_distant_corridor_footsteps.wav', use: 'Something moving nearby' },
  { group: 'Sound effects', title: 'Lights Flicker / Power Loss', credit: 'Original sound design',
    file: 'sound_effects/03_lights_flicker_power_loss.wav', use: 'Failing lights, generator restart' },
  { group: 'Sound effects', title: 'Bulkhead Door', credit: 'Original sound design',
    file: 'sound_effects/04_bulkhead_door.wav', use: 'Doors' },
  { group: 'Sound effects', title: 'Alien Chitter Clicks', credit: 'Original sound design',
    file: 'sound_effects/02_alien_chitter_clicks.wav', use: 'The creature' },
  { group: 'Sound effects', title: 'Low Engine Hum', credit: 'freesound_community via Pixabay',
    file: 'sound_effects/freesound_community-low-engine-hum-72529.mp3', use: 'Generator after repair' },
  { group: 'Sound effects', title: 'Rumble 002', credit: 'freesound_community via Pixabay',
    file: 'sound_effects/freesound_community-rumble-002-26712.mp3', use: 'Hunts and the pod launch' },
];

// Fill a container with one heading and list per group.
export function renderCredits(el) {
  el.textContent = '';
  for (const group of [...new Set(CREDITS.map((c) => c.group))]) {
    const h = document.createElement('h3');
    h.textContent = group;
    const ol = document.createElement('ol');
    for (const c of CREDITS.filter((x) => x.group === group)) {
      const li = document.createElement('li');
      const t = document.createElement('b');
      t.textContent = c.title;
      const by = document.createElement('span');
      by.className = 'by';
      by.textContent = c.credit;
      const use = document.createElement('span');
      use.className = 'use';
      use.textContent = c.use;
      li.append(t, by, use);
      ol.append(li);
    }
    el.append(h, ol);
  }
}

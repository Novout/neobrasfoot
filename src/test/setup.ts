import { beforeEach } from 'vitest'

// Cada teste começa sem save: as stores restauram o localStorage ao serem criadas.
beforeEach(() => localStorage.clear())

import { create } from 'zustand'

type NavDrawerState = {
  open: boolean
  setOpen: (open: boolean) => void
}

/** Shared open-state for the nav drawer so the header hamburger and the
 *  mobile bottom bar's "More" tab control the same drawer instance. */
export const useNavDrawer = create<NavDrawerState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

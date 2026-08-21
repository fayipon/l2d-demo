// Imported rather than referenced from public/ so Vite fingerprints the file
// and rewrites the URL for whatever base the build is deployed under.
import backdropUrl from '../assets/game-background-02.webp'

/**
 * The blood-moon painting behind the stage. The source is 1672x941 (16:9 to
 * within a pixel), so `object-fit: cover` crops imperceptibly at any size.
 */
export function StageBackdrop() {
  return <img className="stage-backdrop" src={backdropUrl} alt="" aria-hidden="true" />
}

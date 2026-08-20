import { PixiCanvas } from '../pixi/PixiCanvas'

export function PixiPage() {
  return (
    <section>
      <h2>Pixi Demo</h2>
      <p>A single Pixi Application is mounted in this route and cleaned on unmount.</p>
      <PixiCanvas />
    </section>
  )
}

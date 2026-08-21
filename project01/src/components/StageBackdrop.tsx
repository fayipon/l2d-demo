/**
 * The painted backdrop behind the stage. Each character brings their own, so
 * the source is passed in rather than imported here.
 *
 * The paintings are 1672x941 -- within a pixel of 16:9 -- so `object-fit:
 * cover` crops imperceptibly at any stage size.
 */
interface StageBackdropProps {
  src: string
}

export function StageBackdrop({ src }: StageBackdropProps) {
  return <img className="stage-backdrop" src={src} alt="" aria-hidden="true" />
}

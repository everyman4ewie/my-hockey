import { useLayoutEffect, useRef } from 'react'
import { Line } from '@react-three/drei'

/** Линии не участвуют в raycast — иначе перекрывают клики по иконкам. */
export function Line3DNoPointerEvents(props) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const o = ref.current
    if (o) o.raycast = () => {}
  })
  return <Line ref={ref} {...props} />
}

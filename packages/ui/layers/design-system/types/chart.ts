import type { AxisConfigInterface } from '@unovis/ts/components/axis/config'

export interface ChartAxis<T extends string | number | Date = string> extends AxisConfigInterface<T> {
  tickThreshold?: number
}

export interface ChartXYAxis<X, Y> {
  x: ChartAxis<X> & {
    position?: 'top' | 'bottom'
  }
  y: ChartAxis<Y> & {
    position: 'left' | 'right'
  }
}

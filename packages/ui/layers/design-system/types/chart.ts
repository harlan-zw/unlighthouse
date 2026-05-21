import type { AxisConfigInterface } from '@unovis/ts/components/axis/config'

export interface ChartAxis<T extends string | number | Date = string> extends AxisConfigInterface<T> {
  tickThreshold?: number
}

export interface ChartXYAxis<X extends string | number | Date, Y extends string | number | Date> {
  x: ChartAxis<X> & {
    position?: 'top' | 'bottom'
  }
  y: ChartAxis<Y> & {
    position: 'left' | 'right'
  }
}

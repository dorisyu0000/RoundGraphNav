import {invariant, numString} from './utils.js';

export class Bonus {
  constructor(options) {
    let {points_per_cent, initial = 0} = options;
    invariant(typeof(points_per_cent) == 'number',
      `points_per_cent must be a number, but is ${JSON.stringify(points_per_cent)}`)
    invariant(typeof(initial) == 'number',
      `initial must be a number, but is ${JSON.stringify(points_per_cent)}`)
    this.points = this.initial = initial
    this.points_per_cent = points_per_cent
  }
  addPoints(points) {
    this.points += points
    console.log('addPoints', this.points, points)
  }
  dollars() {
    let cents = Math.max(0, Math.round(this.points / this.points_per_cent))
    return cents / 100
  }
  reportBonus() {
    return `You current bonus is $${this.dollars().toFixed('2')} (${this.points} points)`
  }
  describeScheme() {
    return "one cent for every " + numString(this.points_per_cent, "point", {skip_one: true})
  }
}
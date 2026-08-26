const TEN = 10n;

function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x || 1n;
}

function pow10(exponent) {
  if (!Number.isInteger(exponent) || exponent < 0) {
    throw new RangeError("Decimal exponent must be a non-negative integer.");
  }
  return TEN ** BigInt(exponent);
}

function divideRounded(numerator, denominator, mode = "half_even") {
  if (denominator <= 0n || numerator < 0n) {
    throw new RangeError("Rounded division expects non-negative values.");
  }

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const doubled = remainder * 2n;

  if (doubled > denominator) return quotient + 1n;
  if (doubled < denominator) return quotient;
  if (mode === "half_up") return quotient + 1n;
  return quotient % 2n === 0n ? quotient : quotient + 1n;
}

function floorLog10(numerator, denominator) {
  const nDigits = numerator.toString().length;
  const dDigits = denominator.toString().length;
  let exponent = nDigits - dDigits;

  if (exponent >= 0) {
    if (numerator < denominator * pow10(exponent)) exponent -= 1;
  } else if (numerator * pow10(-exponent) < denominator) {
    exponent -= 1;
  }

  return exponent;
}

export class ExactDecimal {
  constructor(numerator, denominator = 1n) {
    if (denominator === 0n) throw new RangeError("Division by zero.");
    let n = BigInt(numerator);
    let d = BigInt(denominator);
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const factor = gcd(n, d);
    this.numerator = n / factor;
    this.denominator = d / factor;
    Object.freeze(this);
  }

  static parse(value, { allowNegative = true } = {}) {
    if (typeof value !== "string") {
      throw new TypeError("Production decimals must be supplied as strings.");
    }
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
      throw new TypeError(`Invalid decimal: ${value}`);
    }
    if (!allowNegative && value.startsWith("-")) {
      throw new RangeError("Negative values are not allowed.");
    }

    const negative = value.startsWith("-");
    const unsigned = negative ? value.slice(1) : value;
    const [whole, fraction = ""] = unsigned.split(".");
    const numerator = BigInt(`${whole}${fraction}` || "0") * (negative ? -1n : 1n);
    return new ExactDecimal(numerator, pow10(fraction.length));
  }

  static fromInteger(value) {
    return new ExactDecimal(BigInt(value));
  }

  add(other) {
    const rhs = ExactDecimal.from(other);
    return new ExactDecimal(
      this.numerator * rhs.denominator + rhs.numerator * this.denominator,
      this.denominator * rhs.denominator,
    );
  }

  subtract(other) {
    const rhs = ExactDecimal.from(other);
    return new ExactDecimal(
      this.numerator * rhs.denominator - rhs.numerator * this.denominator,
      this.denominator * rhs.denominator,
    );
  }

  multiply(other) {
    const rhs = ExactDecimal.from(other);
    return new ExactDecimal(
      this.numerator * rhs.numerator,
      this.denominator * rhs.denominator,
    );
  }

  divide(other) {
    const rhs = ExactDecimal.from(other);
    if (rhs.numerator === 0n) throw new RangeError("Division by zero.");
    return new ExactDecimal(
      this.numerator * rhs.denominator,
      this.denominator * rhs.numerator,
    );
  }

  abs() {
    return this.numerator < 0n
      ? new ExactDecimal(-this.numerator, this.denominator)
      : this;
  }

  compare(other) {
    const rhs = ExactDecimal.from(other);
    const difference =
      this.numerator * rhs.denominator - rhs.numerator * this.denominator;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  }

  equals(other) {
    return this.compare(other) === 0;
  }

  isZero() {
    return this.numerator === 0n;
  }

  roundToIncrement(increment, mode = "half_up") {
    const step = ExactDecimal.from(increment);
    if (this.numerator < 0n || step.compare(ExactDecimal.ZERO) <= 0) {
      throw new RangeError("Increment rounding requires a non-negative value and positive step.");
    }
    const numerator = this.numerator * step.denominator;
    const denominator = this.denominator * step.numerator;
    const units = divideRounded(numerator, denominator, mode);
    return step.multiply(new ExactDecimal(units));
  }

  toSignificant(significantDigits = 24, mode = "half_even") {
    if (!Number.isInteger(significantDigits) || significantDigits < 1) {
      throw new RangeError("Significant digits must be a positive integer.");
    }
    if (this.isZero()) return "0";

    const negative = this.numerator < 0n;
    const numerator = negative ? -this.numerator : this.numerator;
    const exponent = floorLog10(numerator, this.denominator);
    const decimalPlaces = significantDigits - 1 - exponent;
    let rounded;
    let rendered;

    if (decimalPlaces >= 0) {
      rounded = divideRounded(
        numerator * pow10(decimalPlaces),
        this.denominator,
        mode,
      );
      let digits = rounded.toString().padStart(decimalPlaces + 1, "0");
      if (decimalPlaces === 0) {
        rendered = digits;
      } else {
        const split = digits.length - decimalPlaces;
        rendered = `${digits.slice(0, split)}.${digits.slice(split)}`;
      }
    } else {
      const place = pow10(-decimalPlaces);
      rounded = divideRounded(numerator, this.denominator * place, mode) * place;
      rendered = rounded.toString();
    }

    rendered = rendered.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
    return negative ? `-${rendered}` : rendered;
  }

  toFixed(decimalPlaces, mode = "half_even") {
    if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0) {
      throw new RangeError("Decimal places must be a non-negative integer.");
    }
    const negative = this.numerator < 0n;
    const numerator = negative ? -this.numerator : this.numerator;
    const rounded = divideRounded(
      numerator * pow10(decimalPlaces),
      this.denominator,
      mode,
    );
    const digits = rounded.toString().padStart(decimalPlaces + 1, "0");
    const rendered = decimalPlaces === 0
      ? digits
      : `${digits.slice(0, -decimalPlaces)}.${digits.slice(-decimalPlaces)}`;
    return negative ? `-${rendered}` : rendered;
  }

  toNumber() {
    return Number(this.numerator) / Number(this.denominator);
  }

  static from(value) {
    if (value instanceof ExactDecimal) return value;
    if (typeof value === "bigint" || Number.isInteger(value)) {
      return new ExactDecimal(BigInt(value));
    }
    if (typeof value === "string") return ExactDecimal.parse(value);
    throw new TypeError("Unsupported decimal value.");
  }
}

ExactDecimal.ZERO = new ExactDecimal(0n);
ExactDecimal.ONE = new ExactDecimal(1n);
ExactDecimal.ONE_HUNDRED = new ExactDecimal(100n);

export function sumDecimals(values) {
  return values.reduce((total, value) => total.add(value), ExactDecimal.ZERO);
}

export function percent(numerator, denominator) {
  return ExactDecimal.from(numerator)
    .divide(denominator)
    .multiply(ExactDecimal.ONE_HUNDRED);
}

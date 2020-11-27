"use strict";

class bme280Driver {
  constructor(i2cSettings) {
    const i2c = require("i2c-bus");

    const bme280DefaultAddress = 0x76; // default i2c address of bme280
    this.t_fine = 0;

    this.i2cBusNo =
      i2cSettings && i2cSettings.hasOwnProperty("i2cBusNo")
        ? i2cSettings.i2cBusNo
        : 1;
    this.i2cBus = i2c.openSync(this.i2cBusNo);
    this.i2cAddress =
      i2cSettings && i2cSettings.hasOwnProperty("i2cAddress")
        ? i2cSettings.i2cAddress
        : bme280DefaultAddress;

    // bme280 registers
    this.BME280_REG_SOFTRESET = 0xe0;

    this.BME280_REG_CAL26 = 0xe1;
    this.BME280_REG_CONTROLHUMID = 0xf2;
    this.BME280_REG_STATUS = 0xf3;
    this.BME280_REG_CONTROLMEASURE = 0xf4;
    this.BME280_REG_CONFIG = 0xf5;
    this.BME280_REG_PRESSURE = 0xf7;
    this.BME280_REG_TEMP_MSB = 0xfa;
    this.BME280_REG_TEMP_CSB = 0xfb;
    this.BME280_REG_TEMP_LSB = 0xfc;
    this.BME280_REG_HUMID = 0xfd;

    this.BME280_DIG_T1_REG = 0x88;
    this.BME280_DIG_T2_REG = 0x8a;
    this.BME280_DIG_T3_REG = 0x8c;
    this.BME280_DIG_P1_REG = 0x8e;
    this.BME280_DIG_P2_REG = 0x90;
    this.BME280_DIG_P3_REG = 0x92;
    this.BME280_DIG_P4_REG = 0x94;
    this.BME280_DIG_P5_REG = 0x96;
    this.BME280_DIG_P6_REG = 0x98;
    this.BME280_DIG_P7_REG = 0x9a;
    this.BME280_DIG_P8_REG = 0x9c;
    this.BME280_DIG_P9_REG = 0x9e;

    this.BME280_DIG_H1_REG = 0xa1;
    this.BME280_DIG_H2_REG = 0xe1;
    this.BME280_DIG_H3_REG = 0xe3;
    this.BME280_DIG_H4_REG = 0xe4;
    this.BME280_DIG_H5_REG = 0xe5;
    this.BME280_DIG_H6_REG = 0xe7;

    // oversampling values
    this.BME_OSR_1 = 0x01;
    this.BME_OSR_2 = 0x02;
    this.BME_OSR_4 = 0x03;
    this.BME_OSR_8 = 0x04;

    // device id
    this.BME280_REG_CHIPID = 0xd0;
    this.BME280_DEVICE_ID = 0x60;
  }
  /**
   * This function configures bme280
   * @returns {string} resolve with sensor id
   * @returns {string} reject with error
   */
  init() {
    return new Promise((resolve, reject) => {
      this.i2cBus.readByte(
        this.i2cAddress,
        this.BME280_REG_CHIPID,
        (err, bme280Id) => {
          if (err) {
            return reject(err);
          } else if (bme280Id !== this.BME280_DEVICE_ID) {
            return reject(
              `Device returned invalid ID: 0x${bme280Id.toString(16)}`
            );
          } else {
            console.log(
              `Device found with ID 0x${bme280Id.toString(16)} on bus i2c-${
                this.i2cBusNo
              }, address 0x${this.i2cAddress.toString(16)}`
            );
            this.readSensorCoefficients();

            this.i2cBus.writeByte(
              this.i2cAddress,
              this.BME280_REG_CONTROLHUMID,
              0x01,
              (err) => {
                if (err) {
                  return reject(err);
                }

                this.i2cBus.writeByte(
                  this.i2cAddress,
                  this.BME280_REG_CONTROLMEASURE,
                  0x3f,
                  (err) => {
                    return err ? reject(err) : resolve(bme280Id);
                  }
                );
              }
            );
          }
        }
      );
    });
  }

  /**
   * Read temperature, humidity and pressure values from bme280
   * @returns {object} resolve with javascript object of data
   * @returns {string} reject if unsuccessful
   */
  readSensorData() {
    return new Promise((resolve, reject) => {
      if (!this.cal_data) {
        return reject("did you call bme280.init()?");
      }
      resolve({
        temperature_C: (Math.round(this.readTemperature() * 100) / 100).toFixed(
          2
        ),
        humidity: (Math.round(this.readHumidity() * 100) / 100).toFixed(2),
        pressure_hPa: (
          Math.round((this.readPressure() / 100) * 100) / 100
        ).toFixed(2),
      });
    });
  }

  /**
   * this function retrieves the temperature from bme280
   * @returns {number} ambient temperature in degree celcius
   */
  readTemperature() {
    let temperature = 0;

    let var1 = 0;
    let var2 = 0;

    let rawTemp =
      this.i2cBus.readByteSync(this.i2cAddress, this.BME280_REG_TEMP_MSB) << 12;
    rawTemp |=
      this.i2cBus.readByteSync(this.i2cAddress, this.BME280_REG_TEMP_CSB) << 4;
    rawTemp |=
      (this.i2cBus.readByteSync(this.i2cAddress, this.BME280_REG_TEMP_LSB) <<
        4) &
      0x0f;

    var1 =
      (((rawTemp >> 3) - (this.cal_data.dig_T1 << 1)) * this.cal_data.dig_T2) >>
      11;

    var2 =
      (((((rawTemp >> 4) - this.cal_data.dig_T1) *
        ((rawTemp >> 4) - this.cal_data.dig_T1)) >>
        12) *
        this.cal_data.dig_T3) >>
      14;

    this.t_fine = var1 + var2;

    temperature = (this.t_fine * 5 + 128) >> 8;

    temperature = temperature / 100;

    return temperature;
  }

  /**
   * this function retrieves the humidity from bme280
   * @returns {number} actual relative humidity
   */
  readHumidity() {
    let humidity = 0;

    let rawHumidity = this.BE2LE(
      this.i2cBus.readWordSync(this.i2cAddress, this.BME280_REG_HUMID)
    );

    let v_x1_u32r = 0;

    v_x1_u32r = this.t_fine - 76800;

    v_x1_u32r =
      (((rawHumidity << 14) -
        (this.cal_data.dig_H4 << 20) -
        this.cal_data.dig_H5 * v_x1_u32r +
        16384) >>
        15) *
      (((((((v_x1_u32r * this.cal_data.dig_H6) >> 10) *
        (((v_x1_u32r * this.cal_data.dig_H3) >> 11) + 32768)) >>
        10) +
        2097152) *
        this.cal_data.dig_H2 +
        8192) >>
        14);

    v_x1_u32r =
      v_x1_u32r -
      (((((v_x1_u32r >> 15) * (v_x1_u32r >> 15)) >> 7) *
        this.cal_data.dig_H1) >>
        4);

    v_x1_u32r = v_x1_u32r < 0 ? 0 : v_x1_u32r;

    v_x1_u32r = v_x1_u32r > 419430400 ? 419430400 : v_x1_u32r;

    let h = v_x1_u32r >> 12;

    humidity = h / 1024.0;

    return humidity;
  }
  /**
   * this function retrieves the pressure from bme280
   * @returns {number} atmospheric pressure in pascals
   */
  readPressure() {
    let pressure = BigInt(0);

    let var1 = 0n;
    let var2 = 0n;
    let p = 0n;
    let _t = parseInt(this.t_fine);

    let rawPressure = new Buffer(3);
    this.i2cBus.readI2cBlockSync(
      this.i2cAddress,
      this.BME280_REG_PRESSURE,
      3,
      rawPressure
    );
    let _rawPressure = BigInt(
      this.uint20(rawPressure[0], rawPressure[1], rawPressure[2])
    );

    var1 = BigInt(_t) - 128000n;
    var2 = var1 * var1 * BigInt(this.cal_data.dig_P6);
    var2 = var2 + BigInt((var1 * BigInt(this.cal_data.dig_P5)) << 17n);
    var2 = var2 + (BigInt(this.cal_data.dig_P4) << 35n);
    var1 =
      ((var1 * var1 * BigInt(this.cal_data.dig_P3)) >> 8n) +
      ((var1 * BigInt(this.cal_data.dig_P2)) << 12n);
    var1 = (((1n << 47n) + var1) * BigInt(this.cal_data.dig_P1)) >> 33n;
    if (var1 == 0) {
      pressure = 0.0;
    }

    p = 1048576n - _rawPressure;
    p = (((p << 31n) - var2) * 3125n) / var1;
    var1 = (BigInt(this.cal_data.dig_P9) * (p >> 13n) * (p >> 13n)) >> 25n;
    var2 = (BigInt(this.cal_data.dig_P8) * p) >> 19n;

    p = ((p + var1 + var2) >> 8n) + (BigInt(this.cal_data.dig_P7) << 4n);

    pressure = p / 256n;

    return Number(pressure);
  }
  /**
   * This function reads the calibration data on BME280
   */
  readSensorCoefficients() {
    this.cal_data = {
      dig_T1: this.i2cBus.readWordSync(this.i2cAddress, this.BME280_DIG_T1_REG),
      dig_T2: this.pos2neg(
        this.i2cBus.readWordSync(this.i2cAddress, this.BME280_DIG_T2_REG)
      ),
      dig_T3: this.pos2neg(
        this.i2cBus.readWordSync(this.i2cAddress, this.BME280_DIG_T3_REG)
      ),
      dig_P1: this.i2cBus.readWordSync(this.i2cAddress, this.BME280_DIG_P1_REG),
      dig_P2: this.pos2neg(
        this.i2cBus.readWordSync(this.i2cAddress, this.BME280_DIG_P2_REG)
      ),
      dig_P3: this.pos2neg(
        this.i2cBus.readWordSync(this.i2cAddress, this.BME280_DIG_P3_REG)
      ),
      dig_P4: this.pos2neg(
        this.i2cBus.readWordSync(this.i2cAddress, this.BME280_DIG_P4_REG)
      ),
      dig_P5: this.pos2neg(
        this.i2cBus.readWordSync(this.i2cAddress, this.BME280_DIG_P5_REG)
      ),
      dig_P6: this.pos2neg(
        this.i2cBus.readWordSync(this.i2cAddress, this.BME280_DIG_P6_REG)
      ),
      dig_P7: this.pos2neg(
        this.i2cBus.readWordSync(this.i2cAddress, this.BME280_DIG_P7_REG)
      ),
      dig_P8: this.pos2neg(
        this.i2cBus.readWordSync(this.i2cAddress, this.BME280_DIG_P8_REG)
      ),
      dig_P9: this.pos2neg(
        this.i2cBus.readWordSync(this.i2cAddress, this.BME280_DIG_P9_REG)
      ),
      dig_H1: this.pos2neg(
        this.i2cBus.readByteSync(this.i2cAddress, this.BME280_DIG_H1_REG)
      ),
      dig_H2: this.pos2neg(
        this.i2cBus.readWordSync(this.i2cAddress, this.BME280_DIG_H2_REG)
      ),
      dig_H3: this.pos2neg(
        this.i2cBus.readByteSync(this.i2cAddress, this.BME280_DIG_H3_REG)
      ),
      dig_H4: this.pos2neg(
        (this.i2cBus.readByteSync(this.i2cAddress, this.BME280_DIG_H4_REG) <<
          4) |
          (this.i2cBus.readByteSync(
            this.i2cAddress,
            this.BME280_DIG_H4_REG + 1
          ) &
            0xf)
      ),
      dig_H5: this.pos2neg(
        (this.i2cBus.readByteSync(
          this.i2cAddress,
          this.BME280_DIG_H5_REG + 1
        ) <<
          4) |
          (this.i2cBus.readByteSync(this.i2cAddress, this.BME280_DIG_H5_REG) >>
            4)
      ),
      dig_H6: this.pos2neg(
        this.i2cBus.readByteSync(this.i2cAddress, this.BME280_DIG_H6_REG)
      ),
    };
  }


  /**
   * This function converts an unsigned number to a signed number
   * @param  {number} val value to convert
   * @returns {number} negative equivalent of postive number
   */
  pos2neg(val) {
    if (val <= 255) {
      if (((val >> 7) & 0x01) == 0x01) {
        val = -(256 - val);
      }
    } else if (val <= 65535 && val >= 255) {
      if (((val >> 15) & 0x01) == 0x01) {
        val = -(65536 - val);
      }
    }
    return val;
  }

  /**
   * This function converts big endian to little endian
   * @param  {number} val little endian value
   * @returns  {number} big endian value
   */
  BE2LE(val) {
    return ((val & 0xff) << 8) | ((val >> 8) & 0xff);
  }

  /**
   * This function converts 3 byte values into a number
   * @param  {number} msb most significant byte
   * @param  {number} lsb middle byte
   * @param  {number} xlsb least significant byte
   * @returns {number} converted value
   */
  uint20(msb, lsb, xlsb) {
    return ((((msb << 8) | lsb) << 8) | xlsb) >> 4;
  }
}

// make the driver publicly avaiable
module.exports = bme280Driver;

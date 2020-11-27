// get the bme280 driver
const BME280 = require('bme280');

// configure the necessary i2c parameters
const i2cSettings = {
  i2cBusNo   : 1,   // i2c bus depending on linux platform
  i2cAddress : 0x76 // i2c address of bme280
};

// create new instance of bme280 driver with the above i2c settings
const bme280 = new BME280(i2cSettings);

// get the data
const readSensorData = () => {
  bme280.readSensorData()
    .then((data) => { // report data on console if successful
      console.log(`data = ${JSON.stringify(data, null, 2)}`);
      setTimeout(readSensorData, 2000);
    })
    .catch((err) => { // report error on console if unsuccessul
      console.log(`BME280 read error: ${err}`);
      setTimeout(readSensorData, 2000);
    });
};

// Initialize the BME280 sensor
bme280.init()
  .then(() => {
    console.log('BME280 initialization succeeded');
    readSensorData();
  })
  .catch((err) => console.error(`BME280 initialization failed: ${err} `));
import WindRoseChart from "../../components/charts/windRoseChart";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import {
  TemperatureCard,
  HumidityCard,
  PressureCard,
  useEnvStats,
} from "../../components/cards/envstatscard";
import SensorInfoCard from "../../components/cards/sensorInfoCard";
import AirQualityCardGroup from "../../components/cards/airQualityCard";
import GasQualityCardGroup from "../../components/cards/gasQualityCard";
import WeatherForecast from "../../components/cards/weathercard";
import RealtimeMultiLineChart from "../../components/charts/LineChart";

export default function UserHome() {
  const { temperature, humidity, pressure } = useEnvStats();

  return (
    <>
      <PageMeta title="Bayu Sense - Dashboard" description="Dashboard" />
      <PageBreadcrumb pageTitle="Dashboard" />

      {/* Device info */}
      <div className="mx-auto mt-8 px-4 container">
        <SensorInfoCard />
      </div>

      {/* Air quality — particulates + gases */}
      <div className="mx-auto mt-6 px-4 container">
        <div className="flex flex-col bg-white dark:bg-white/[0.03] p-6 border border-gray-200 dark:border-gray-800 rounded-2xl">
          <AirQualityCardGroup />
          <GasQualityCardGroup />

          {/* Wind Rose Chart + Vertical Env Cards */}
          <div className="gap-6 grid grid-cols-1 lg:grid-cols-3 mx-auto mt-8 px-4 container">
            {/* Wind Rose Chart - 2/3 width on large screens */}
            <div className="flex justify-center items-center lg:col-span-2 bg-white dark:bg-white/[0.03] p-6 border border-gray-200 dark:border-gray-800 rounded-2xl">
              <WindRoseChart />
            </div>

            {/* Vertical stack of cards */}
            <div className="flex flex-col gap-4 w-full">
              <TemperatureCard value={temperature} />
              <HumidityCard value={humidity} />
              <PressureCard value={pressure} />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-6 mb-8 px-4 container">
        <RealtimeMultiLineChart />
      </div>

      <div className="mx-auto mt-6 mb-8 px-4 container">
        <WeatherForecast />
      </div>
    </>
  );
}

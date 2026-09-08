import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router";
import SignIn from "./pages/AuthPages/SignIn";
import SignUp from "./pages/AuthPages/SignUp";
import NotFound from "./pages/OtherPage/NotFound";
import UserProfiles from "./pages/UserProfiles";
import Images from "./pages/UiElements/Images";
import Alerts from "./pages/UiElements/Alerts";
import Badges from "./pages/UiElements/Badges";
import Avatars from "./pages/UiElements/Avatars";
import Buttons from "./pages/UiElements/Buttons";
import Calendar from "./pages/Calendar";
import BasicTables from "./pages/Tables/BasicTables";
import FormElements from "./pages/Forms/FormElements";
import Blank from "./pages/Blank";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import Map from "./pages/Map";
import Compare from "./pages/Compare";
import CSV from "./components/tables/BasicTables/csv";
import UserHome from "./pages/Dashboard/User";
import ReportViewer from "./components/tables/BasicTables/report";
import Blank2 from "./pages/Blank copy";
import AdminLicensePage from "./pages/LicenseAdmin";
import License from "./pages/License";
import ApiTutorial from "./pages/public-api";
import Downloads from "./pages/Downloads";
import AddStation from "./pages/AddStation";
import SensorSettings from "./pages/SensorSettings";

export default function App() {
  return (
    <>
      <Router>
        <ScrollToTop />
        <Routes>
          {/* Dashboard Layout */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/signin" replace />} />

            {/* Others Page */}
            <Route path="/user" element={<UserHome />} />
            <Route path="/profile" element={<UserProfiles />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/blank" element={<Blank />} />
            <Route path="/license" element={<License />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/map" element={<Map />} />
            <Route path="/csv" element={<CSV />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/add-station" element={<AddStation />} />
            <Route path="/sensor-settings" element={<SensorSettings />} />
            <Route path="/licenseadmin" element={<AdminLicensePage />} />
            <Route path="/public-api" element={<ApiTutorial />} />

            {/* Dashboard */}

            {/* Forms */}
            <Route path="/form-elements" element={<FormElements />} />
            <Route path="/blank2" element={<Blank2 />} />

            {/* Tables */}
            <Route path="/basic-tables" element={<BasicTables />} />
            <Route path="/report-tables" element={<ReportViewer />} />

            {/* Ui Elements */}
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/avatars" element={<Avatars />} />
            <Route path="/badge" element={<Badges />} />
            <Route path="/buttons" element={<Buttons />} />
            <Route path="/images" element={<Images />} />

            {/* Charts */}
          </Route>

          {/* Auth Layout */}
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />

          {/* Fallback Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </>
  );
}

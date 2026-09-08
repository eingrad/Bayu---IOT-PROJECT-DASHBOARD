import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

export default function Home() {
  // URL of your ThingsBoard Dashboard (replace with your actual URL)
  const dashboardUrl =
    "http://localhost:8080/dashboard/220c6c30-04d5-11f0-b9ea-870421f1d527?publicId=2296bcc0-04d3-11f0-b9ea-870421f1d527";

  return (
    <>
      <PageMeta title="Bayu Sense - Dashboard" description="Dashboard" />
      <PageBreadcrumb pageTitle="Dashboard" />

      <div
        className="space-y-6 col-span-12 xl:col-span-7"
        style={{ height: "210vh" }}
      >
        {/* Embed ThingsBoard Dashboard */}
        <iframe
          src={dashboardUrl}
          width="100%" // Make iframe responsive (fills parent container's width)
          height="100%" // Make height responsive (fills parent container's height)
          style={{ border: "none", height: "100%" }} // Ensure iframe takes up full height
          title="ThingsBoard Dashboard"
        />
      </div>
    </>
  );
}

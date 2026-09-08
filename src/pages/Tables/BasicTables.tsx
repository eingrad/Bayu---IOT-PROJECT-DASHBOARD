import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import BasicTableOneX from "../../components/tables/BasicTables/BasicTableOne copy";

export default function BasicTables() {
  return (
    <>
      <PageMeta title="User Management" description="Manage application users" />
      <PageBreadcrumb pageTitle="User Management" />
      <div className="mt-2">
        <BasicTableOneX />
      </div>
    </>
  );
}

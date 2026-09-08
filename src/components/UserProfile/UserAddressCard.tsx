import { useModal } from "../../hooks/useModal";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Label from "../form/Label";

export default function UserAddressCard() {
  const { isOpen, openModal, closeModal } = useModal();
  const handleSave = () => {
    // Handle save logic here
    console.log("Saving changes...");
    closeModal();
  };
  return (
    <>
      <div className="p-5 lg:p-6 border border-gray-200 dark:border-gray-800 rounded-2xl">
        <div className="flex lg:flex-row flex-col lg:justify-between lg:items-start gap-6">
          <div>
            <h4 className="lg:mb-6 font-semibold text-gray-800 dark:text-white/90 text-lg">
              Address
            </h4>

            <div className="gap-4 lg:gap-7 2xl:gap-x-32 grid grid-cols-1 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-gray-500 dark:text-gray-400 text-xs leading-normal">
                  Country
                </p>
                <p className="font-medium text-gray-800 dark:text-white/90 text-sm">
                  Malaysia.
                </p>
              </div>

              <div>
                <p className="mb-2 text-gray-500 dark:text-gray-400 text-xs leading-normal">
                  City/State
                </p>
                <p className="font-medium text-gray-800 dark:text-white/90 text-sm">
                  Seri Kembangan, Selangor, Malaysia.
                </p>
              </div>

              <div>
                <p className="mb-2 text-gray-500 dark:text-gray-400 text-xs leading-normal">
                  Postal Code
                </p>
                <p className="font-medium text-gray-800 dark:text-white/90 text-sm">
                  43300
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={openModal}
            className="lg:inline-flex flex justify-center items-center gap-2 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-white/[0.03] shadow-theme-xs px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-full w-full lg:w-auto font-medium text-gray-700 hover:text-gray-800 dark:hover:text-gray-200 dark:text-gray-400 text-sm"
          >
            <svg
              className="fill-current"
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M15.0911 2.78206C14.2125 1.90338 12.7878 1.90338 11.9092 2.78206L4.57524 10.116C4.26682 10.4244 4.0547 10.8158 3.96468 11.2426L3.31231 14.3352C3.25997 14.5833 3.33653 14.841 3.51583 15.0203C3.69512 15.1996 3.95286 15.2761 4.20096 15.2238L7.29355 14.5714C7.72031 14.4814 8.11172 14.2693 8.42013 13.9609L15.7541 6.62695C16.6327 5.74827 16.6327 4.32365 15.7541 3.44497L15.0911 2.78206ZM12.9698 3.84272C13.2627 3.54982 13.7376 3.54982 14.0305 3.84272L14.6934 4.50563C14.9863 4.79852 14.9863 5.2734 14.6934 5.56629L14.044 6.21573L12.3204 4.49215L12.9698 3.84272ZM11.2597 5.55281L5.6359 11.1766C5.53309 11.2794 5.46238 11.4099 5.43238 11.5522L5.01758 13.5185L6.98394 13.1037C7.1262 13.0737 7.25666 13.003 7.35947 12.9002L12.9833 7.27639L11.2597 5.55281Z"
                fill=""
              />
            </svg>
            Edit
          </button>
        </div>
      </div>
      <Modal isOpen={isOpen} onClose={closeModal} className="m-4 max-w-[700px]">
        <div className="relative bg-white dark:bg-gray-900 p-4 lg:p-11 rounded-3xl w-full overflow-y-auto no-scrollbar">
          <div className="px-2 pr-14">
            <h4 className="mb-2 font-semibold text-gray-800 dark:text-white/90 text-2xl">
              Edit Address
            </h4>
            <p className="mb-6 lg:mb-7 text-gray-500 dark:text-gray-400 text-sm">
              Update your details to keep your profile up-to-date.
            </p>
          </div>
          <form className="flex flex-col">
            <div className="px-2 overflow-y-auto custom-scrollbar">
              <div className="gap-x-6 gap-y-5 grid grid-cols-1 lg:grid-cols-2">
                <div>
                  <Label>Country</Label>
                  <Input type="text" defaultValue="United States" />
                </div>

                <div>
                  <Label>City/State</Label>
                  <Input type="text" defaultValue="Arizona, United States." />
                </div>

                <div>
                  <Label>Postal Code</Label>
                  <Input type="text" defaultValue="ERT 2489" />
                </div>

                <div>
                  <Label>TAX ID</Label>
                  <Input type="text" defaultValue="AS4568384" />
                </div>
              </div>
            </div>
            <div className="flex lg:justify-end items-center gap-3 mt-6 px-2">
              <Button size="sm" variant="outline" onClick={closeModal}>
                Close
              </Button>
              <Button size="sm" onClick={handleSave}>
                Save Changes
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}

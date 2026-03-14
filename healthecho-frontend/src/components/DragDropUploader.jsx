import { useDropzone } from "react-dropzone";

export default function DragDropUploader({ onFileSelected }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    accept: {
      "application/pdf": [".pdf"],
      "image/*": [".png", ".jpg", ".jpeg", ".webp"],
    },
    onDrop: (acceptedFiles) => {
      if (acceptedFiles[0]) onFileSelected(acceptedFiles[0]);
    },
  });

  return (
    <div
      {...getRootProps()}
      className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition ${
        isDragActive ? "border-medicalBlue bg-blue-50" : "border-blue-200 bg-white"
      } dark:border-blue-500/50 dark:bg-slate-800`}
    >
      <input {...getInputProps()} />
      <p className="font-semibold">Drag and drop report PDF/image here</p>
      <p className="text-sm text-slate-500 dark:text-slate-300">or click to upload</p>
    </div>
  );
}

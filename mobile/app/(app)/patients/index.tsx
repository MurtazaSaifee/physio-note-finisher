import React, { useState } from "react";

import { CreatePatientScreen } from "../../../features/patients/screens/CreatePatientScreen";
import { PatientListScreen } from "../../../features/patients/screens/PatientListScreen";
import { PatientProfileScreen } from "../../../features/patients/screens/PatientProfileScreen";

export default function PatientsIndexRoute(): React.JSX.Element {
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [isAddingPatient, setIsAddingPatient] = useState(false);

  if (selectedPatientId) {
    return (
      <PatientProfileScreen
        patientId={selectedPatientId}
        onBack={() => setSelectedPatientId(null)}
      />
    );
  }

  if (isAddingPatient) {
    return (
      <CreatePatientScreen
        onBack={() => setIsAddingPatient(false)}
        onCreated={(patientId) => {
          setIsAddingPatient(false);
          setSelectedPatientId(patientId);
        }}
      />
    );
  }

  return (
    <PatientListScreen
      onAddPatient={() => setIsAddingPatient(true)}
      onOpenPatient={setSelectedPatientId}
    />
  );
}

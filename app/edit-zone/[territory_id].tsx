import React from "react";
import { useLocalSearchParams } from "expo-router";
import CreateZoneScreen from "../create-zone";

export default function EditZoneScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ territory_id?: string }>();
  const territoryId =
    typeof params.territory_id === "string" ? params.territory_id : undefined;

  return <CreateZoneScreen mode="edit" territoryId={territoryId} />;
}

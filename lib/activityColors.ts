import { COLORS } from "@/constants";
import { Activity, VisitResponse } from "./activityApi";

export interface ActivityColors {
  dotColor: string;
  backgroundColor: string;
}

/**
 * Get colors for an activity based on its type and status/response
 * @param activity - The activity object
 * @returns Object with dotColor and backgroundColor
 */
export const getActivityColors = (activity: Activity): ActivityColors => {
  console.log("🎨 getActivityColors called with activity:", {
    _id: activity._id,
    activityType: activity.activityType,
    operationType: activity.operationType,
    response: activity.response,
    notes: activity.notes?.substring(0, 50) + "...", // Truncate for readability
  });

  // Handle VISIT activities - color based on response
  if (activity.activityType === "VISIT" && activity.response) {
    const colors = getVisitActivityColors(activity.response);
    console.log(
      `✅ VISIT activity - response: ${activity.response}, colors:`,
      colors
    );
    return colors;
  }

  // Handle PROPERTY_OPERATION activities - color based on status change in notes
  if (activity.activityType === "PROPERTY_OPERATION") {
    const colors = getPropertyOperationColors(activity);
    console.log(
      `✅ PROPERTY_OPERATION activity - operationType: ${activity.operationType}, colors:`,
      colors
    );
    return colors;
  }

  // Handle ZONE_OPERATION activities - color based on operationType
  if (activity.activityType === "ZONE_OPERATION") {
    const colors = getZoneOperationColors(activity.operationType);
    console.log(
      `✅ ZONE_OPERATION activity - operationType: ${activity.operationType}, colors:`,
      colors
    );
    return colors;
  }

  // Default fallback (shouldn't happen, but just in case)
  console.log("⚠️ Default fallback colors used");
  return {
    dotColor: COLORS.neutral[500],
    backgroundColor: COLORS.neutral[50],
  };
};

/**
 * Get colors for VISIT activities based on response
 */
const getVisitActivityColors = (response: VisitResponse): ActivityColors => {
  switch (response) {
    case "LEAD_CREATED":
      return {
        dotColor: COLORS.success[500],
        backgroundColor: COLORS.success[50],
      };
    case "APPOINTMENT_SET":
      return {
        dotColor: COLORS.purple[500],
        backgroundColor: COLORS.purple[50],
      };
    case "CALL_BACK":
      return {
        dotColor: COLORS.warning[500],
        backgroundColor: COLORS.warning[50],
      };
    case "FOLLOW_UP":
      return {
        dotColor: COLORS.primary[500],
        backgroundColor: COLORS.primary[50],
      };
    case "NOT_INTERESTED":
      return {
        dotColor: COLORS.neutral[500],
        backgroundColor: COLORS.neutral[50],
      };
    case "NO_ANSWER":
      return {
        dotColor: COLORS.warning[400],
        backgroundColor: COLORS.warning[50],
      };
    default:
      return {
        dotColor: COLORS.primary[500],
        backgroundColor: COLORS.primary[50],
      };
  }
};

/**
 * Get colors for PROPERTY_OPERATION activities based on status change
 */
const getPropertyOperationColors = (activity: Activity): ActivityColors => {
  // Parse notes to extract status change
  if (activity.notes) {
    const statusMatch = activity.notes.match(
      /status:\s*"([^"]+)"\s*→\s*"([^"]+)"/
    );
    if (statusMatch) {
      const [, , newStatus] = statusMatch;
      return getPropertyStatusColors(newStatus);
    }
  }

  // If no status change found, use operationType
  if (activity.operationType === "CREATE") {
    return {
      dotColor: COLORS.success[500],
      backgroundColor: COLORS.success[50],
    };
  }
  if (activity.operationType === "DELETE") {
    return {
      dotColor: COLORS.error[500],
      backgroundColor: COLORS.error[50],
    };
  }

  // Default for UPDATE without status change
  return {
    dotColor: COLORS.warning[500],
    backgroundColor: COLORS.warning[50],
  };
};

/**
 * Get colors based on property/resident status
 */
const getPropertyStatusColors = (status: string): ActivityColors => {
  const normalizedStatus = status.toLowerCase().replace(/-/g, "-");

  switch (normalizedStatus) {
    case "visited":
      return {
        dotColor: COLORS.primary[500],
        backgroundColor: COLORS.primary[50],
      };
    case "interested":
      return {
        dotColor: COLORS.success[500],
        backgroundColor: COLORS.success[50],
      };
    case "not-interested":
      return {
        dotColor: COLORS.neutral[500],
        backgroundColor: COLORS.neutral[50],
      };
    case "callback":
      return {
        dotColor: COLORS.warning[500],
        backgroundColor: COLORS.warning[50],
      };
    case "appointment":
      return {
        dotColor: COLORS.purple[500],
        backgroundColor: COLORS.purple[50],
      };
    case "follow-up":
      return {
        dotColor: COLORS.info[500],
        backgroundColor: COLORS.info[50],
      };
    default:
      return {
        dotColor: COLORS.warning[500],
        backgroundColor: COLORS.warning[50],
      };
  }
};

/**
 * Get colors for ZONE_OPERATION activities based on operationType
 */
const getZoneOperationColors = (operationType?: string): ActivityColors => {
  switch (operationType) {
    case "CREATE":
      return {
        dotColor: COLORS.success[500],
        backgroundColor: COLORS.success[50],
      };
    case "UPDATE":
      return {
        dotColor: COLORS.primary[500],
        backgroundColor: COLORS.primary[50],
      };
    case "DELETE":
      return {
        dotColor: COLORS.error[500],
        backgroundColor: COLORS.error[50],
      };
    default:
      return {
        dotColor: COLORS.primary[500],
        backgroundColor: COLORS.primary[50],
      };
  }
};
